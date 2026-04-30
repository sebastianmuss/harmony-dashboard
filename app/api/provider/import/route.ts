import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { writeAudit, getIp } from '@/lib/audit'

/**
 * POST /api/provider/import
 * Providers upload a clinical CSV. Rows are matched by patient name (decrypted
 * server-side) — the matched name is never returned to the client.
 *
 * Expected CSV columns (header required, names flexible):
 *   patient_name, date, pre_dialysis_weight, idwg, systolic_bp, diastolic_bp
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'provider') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!session.user.center) {
    return NextResponse.json({ error: 'No center assigned' }, { status: 403 })
  }

  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 413 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 413 })
  }

  const text = await file.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 })
  }

  // ── Parse header ─────────────────────────────────────────────────────────────
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'))

  const nameIdx     = findCol(headers, ['patient_name', 'name', 'patient'])
  const dateIdx     = findCol(headers, ['date', 'session_date', 'dialysis_date'])
  const weightIdx   = findCol(headers, ['pre_dialysis_weight', 'weight', 'predialysis_weight', 'pre_weight'])
  const idwgIdx     = findCol(headers, ['idwg', 'interdialytic_weight_gain', 'weight_gain'])
  const systolicIdx = findCol(headers, ['systolic_bp', 'systolic', 'sbp'])
  const diastolicIdx= findCol(headers, ['diastolic_bp', 'diastolic', 'dbp'])

  if (nameIdx === -1 || dateIdx === -1) {
    return NextResponse.json({
      error: 'CSV must have a patient name column (patient_name/name) and a date column (date/session_date)',
    }, { status: 400 })
  }

  // ── Build name → patientId map (server-side decrypt, never returned) ─────────
  const patients = await prisma.patient.findMany({
    where: { center: session.user.center, isActive: true },
    select: { id: true, nameEncrypted: true, patientCode: true },
  })

  const nameToId = new Map<string, number>()
  for (const p of patients) {
    if (!p.nameEncrypted) continue
    const name = decrypt(p.nameEncrypted)
    if (name) nameToId.set(normalize(name), p.id)
  }

  // ── Process rows ──────────────────────────────────────────────────────────────
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = parseCsvLine(line)
    const rowNum = i + 1

    const rawName = cols[nameIdx]?.trim()
    const rawDate = cols[dateIdx]?.trim()

    if (!rawName || !rawDate) {
      errors.push(`Row ${rowNum}: missing name or date`)
      skipped++
      continue
    }

    const patientId = nameToId.get(normalize(rawName))
    if (!patientId) {
      // Report row number and date only — never echo the name back
      errors.push(`Row ${rowNum} (${rawDate}): patient not found or name not registered`)
      skipped++
      continue
    }

    const sessionDate = new Date(rawDate)
    if (isNaN(sessionDate.getTime())) {
      errors.push(`Row ${rowNum}: invalid date "${rawDate}"`)
      skipped++
      continue
    }
    sessionDate.setUTCHours(0, 0, 0, 0)

    const data: Record<string, unknown> = {}
    if (weightIdx   !== -1 && cols[weightIdx])    { const v = parseFloat(cols[weightIdx]);   if (!isNaN(v)) data.preDialysisWeight       = v }
    if (idwgIdx     !== -1 && cols[idwgIdx])      { const v = parseFloat(cols[idwgIdx]);     if (!isNaN(v)) data.interdialyticWeightGain = v }
    if (systolicIdx !== -1 && cols[systolicIdx])  { const v = parseInt(cols[systolicIdx]);   if (!isNaN(v)) data.systolicBp              = v }
    if (diastolicIdx!== -1 && cols[diastolicIdx]) { const v = parseInt(cols[diastolicIdx]);  if (!isNaN(v)) data.diastolicBp             = v }

    if (Object.keys(data).length === 0) { skipped++; continue }

    try {
      await prisma.clinicalData.upsert({
        where: { patientId_sessionDate: { patientId, sessionDate } },
        update: { ...data, recordedAt: new Date() },
        create: { patientId, sessionDate, ...data },
      })
      imported++
    } catch {
      errors.push(`Row ${rowNum} (${rawDate}): failed to save`)
      skipped++
    }
  }

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'import',
    resource: 'clinical',
    changes: { imported, skipped, errorCount: errors.length, center: session.user.center },
    ip: getIp(req),
  })

  return NextResponse.json({ imported, skipped, errors })
}

function normalize(s: string) { return s.toLowerCase().trim().replace(/\s+/g, ' ') }

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else current += ch
  }
  result.push(current)
  return result
}

function findCol(headers: string[], candidates: string[]): number {
  for (const c of candidates) { const i = headers.indexOf(c); if (i !== -1) return i }
  return -1
}
