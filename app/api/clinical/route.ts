import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// ── GET /api/clinical?patientId=&from=&to= ────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
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

  const where: Record<string, unknown> = {}
  if (patientId) where.patientId = parseInt(patientId)
  if (from || to) {
    where.sessionDate = {}
    if (from) (where.sessionDate as Record<string, unknown>).gte = new Date(from)
    if (to) (where.sessionDate as Record<string, unknown>).lte = new Date(to)
  }

  const records = await prisma.clinicalData.findMany({
    where,
    orderBy: [{ patientId: 'asc' }, { sessionDate: 'asc' }],
  })
  return NextResponse.json(records)
}

// ── POST /api/clinical ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !['provider', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { patientId, sessionDate, preDialysisWeight, interdialyticWeightGain, systolicBp, diastolicBp } = body

  if (!patientId || !sessionDate) {
    return NextResponse.json({ error: 'patientId and sessionDate are required' }, { status: 400 })
  }

  const date = new Date(sessionDate)
  date.setHours(0, 0, 0, 0)

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
  return NextResponse.json(record, { status: 201 })
}
