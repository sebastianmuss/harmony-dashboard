import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { writeAudit, getIp } from '@/lib/audit'
import { z } from 'zod'
import logger from '@/lib/logger'

const ClinicalDataSchema = z.object({
  patientId:               z.int().positive(),
  sessionDate:             z.string().date(),
  preDialysisWeight:       z.number().min(20).max(300).nullable().optional(),
  interdialyticWeightGain: z.number().min(0).max(15).nullable().optional(),
  systolicBp:              z.int().min(50).max(300).nullable().optional(),
  diastolicBp:             z.int().min(20).max(200).nullable().optional(),
})

// ── GET /api/clinical?patientId=&from=&to= ────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Patients can only see their own clinical data
  if (session.user.role === 'patient') {
    if (!session.user.patientId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const records = await prisma.clinicalData.findMany({
      where: { patientId: session.user.patientId },
      orderBy: { sessionDate: 'asc' },
    })
    return NextResponse.json(records)
  }

  const { searchParams } = new URL(req.url)
  const patientId = searchParams.get('patientId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // Providers must have a center assignment — no center = no data access
  if (session.user.role === 'provider' && !session.user.center) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const where: Record<string, unknown> = {}
  if (patientId) where.patientId = parseInt(patientId)
  if (from || to) {
    where.sessionDate = {}
    if (from) (where.sessionDate as Record<string, unknown>).gte = new Date(from)
    if (to) (where.sessionDate as Record<string, unknown>).lte = new Date(to)
  }
  // Providers are strictly scoped to their own center
  if (session.user.role === 'provider') {
    where.patient = { center: session.user.center }
  }

  const records = await prisma.clinicalData.findMany({
    where,
    orderBy: [{ patientId: 'asc' }, { sessionDate: 'asc' }],
  })
  return NextResponse.json(records)
}

// ── POST /api/clinical ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || !['provider', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = await req.json()
  const parsed = ClinicalDataSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn({ path: '/api/clinical', errors: parsed.error.flatten() }, 'Clinical data validation failed')
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }
  const { patientId, sessionDate, preDialysisWeight, interdialyticWeightGain, systolicBp, diastolicBp } = parsed.data

  // Providers can only write clinical data for patients in their own center
  if (session.user.role === 'provider') {
    if (!session.user.center) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const target = await prisma.patient.findUnique({ where: { id: patientId }, select: { center: true } })
    if (!target || target.center !== session.user.center) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const date = new Date(sessionDate)
  date.setUTCHours(0, 0, 0, 0)

  const record = await prisma.clinicalData.upsert({
    where: { patientId_sessionDate: { patientId, sessionDate: date } },
    update: {
      preDialysisWeight: preDialysisWeight ?? null,
      interdialyticWeightGain: interdialyticWeightGain ?? null,
      systolicBp: systolicBp ?? null,
      diastolicBp: diastolicBp ?? null,
      recordedAt: new Date(),
    },
    create: {
      patientId,
      sessionDate: date,
      preDialysisWeight: preDialysisWeight ?? null,
      interdialyticWeightGain: interdialyticWeightGain ?? null,
      systolicBp: systolicBp ?? null,
      diastolicBp: diastolicBp ?? null,
    },
  })
  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'create',
    resource: 'clinical',
    resourceId: record.id,
    changes: {
      patientId,
      date: date.toISOString().slice(0, 10),
      preDialysisWeight: preDialysisWeight ?? null,
      interdialyticWeightGain: interdialyticWeightGain ?? null,
      systolicBp: systolicBp ?? null,
      diastolicBp: diastolicBp ?? null,
    },
    ip: getIp(req),
  })

  return NextResponse.json(record, { status: 201 })
}
