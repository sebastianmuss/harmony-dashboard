import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { writeAudit, getIp } from '@/lib/audit'

/**
 * POST /api/admin/import
 * Accepts a CSV file with clinical/dialysis data.
 *
 * Expected CSV format (header row required):
 *   patient_name, date, pre_dialysis_weight, idwg, systolic_bp, diastolic_bp
 *
 * - patient_name must match exactly (case-insensitive) a name in the patients table
 * - date format: YYYY-MM-DD
 * - All clinical columns are optional — only present columns are upserted
 * - Returns a summary: { imported, skipped, errors[] }
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  if (lines.length < 2) return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 })

  // ── Parse header ───────────────────────────────────────────────────────────
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'))

  // Required columns
  const patientCodeIdx = findCol(headers, ['patient_code', 'code', 'patient_name', 'name', 'patient'])
  const dateIdx = findCol(headers, ['date', 'session_date', 'dialysis_date'])

  if (patientCodeIdx === -1 || dateIdx === -1) {
    return NextResponse.json({
      error: 'CSV must have columns for patient code (patient_code/code) and date (date/session_date)',
    }, { status: 400 })
  }

  // Optional clinical columns
  const weightIdx      = findCol(headers, ['pre_dialysis_weight', 'weight', 'predialysis_weight', 'pre_weight'])
  const idwgIdx        = findCol(headers, ['idwg', 'interdialytic_weight_gain', 'weight_gain'])
  const systolicIdx    = findCol(headers, ['systolic_bp', 'systolic', 'sbp'])
  const diastolicIdx   = findCol(headers, ['diastolic_bp', 'diastolic', 'dbp'])

  // ── Load patient code → id map ─────────────────────────────────────────────
  const patients = await prisma.patient.findMany({ select: { id: true, patientCode: true } })
  const nameMap = new Map<string, number>()
  for (const p of patients) nameMap.set(p.patientCode.toUpperCase().trim(), p.id)

  // ── Process rows ───────────────────────────────────────────────────────────
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = parseCsvLine(line)
    const rowNum = i + 1

    const rawCode = cols[patientCodeIdx]?.trim()
    const rawDate = cols[dateIdx]?.trim()

    if (!rawCode || !rawDate) {
      errors.push(`Row ${rowNum}: missing patient code or date`)
      skipped++
      continue
    }

    const patientId = nameMap.get(rawCode.toUpperCase())
    if (!patientId) {
      errors.push(`Row ${rowNum}: patient "${rawCode}" not found`)
      skipped++
      continue
    }

    const sessionDate = new Date(rawDate)
    if (isNaN(sessionDate.getTime())) {
      errors.push(`Row ${rowNum}: invalid date "${rawDate}"`)
      skipped++
      continue
    }
    sessionDate.setHours(0, 0, 0, 0)

    // Build upsert data — only include columns present in CSV
    const data: Record<string, unknown> = {}
    if (weightIdx !== -1 && cols[weightIdx]) {
      const v = parseFloat(cols[weightIdx])
      if (!isNaN(v)) data.preDialysisWeight = v
    }
    if (idwgIdx !== -1 && cols[idwgIdx]) {
      const v = parseFloat(cols[idwgIdx])
      if (!isNaN(v)) data.interdialyticWeightGain = v
    }
    if (systolicIdx !== -1 && cols[systolicIdx]) {
      const v = parseInt(cols[systolicIdx])
      if (!isNaN(v)) data.systolicBp = v
    }
    if (diastolicIdx !== -1 && cols[diastolicIdx]) {
      const v = parseInt(cols[diastolicIdx])
      if (!isNaN(v)) data.diastolicBp = v
    }

    if (Object.keys(data).length === 0) {
      skipped++
      continue
    }

    try {
      await prisma.clinicalData.upsert({
        where: { patientId_sessionDate: { patientId, sessionDate } },
        update: { ...data, recordedAt: new Date() },
        create: { patientId, sessionDate, ...data },
      })
      imported++
    } catch (e: unknown) {
      errors.push(`Row ${rowNum}: Failed to save data`)
      skipped++
    }
  }

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'import',
    resource: 'clinical',
    changes: { imported, skipped, errorCount: errors.length },
    ip: getIp(req),
  })

  return NextResponse.json({ imported, skipped, errors })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a single CSV line, handling quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function findCol(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.indexOf(c)
    if (idx !== -1) return idx
  }
  return -1
}
