import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { pinIndexHash, validatePin } from '@/lib/pin'

// ── GET /api/patients?shiftId= ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'patient') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const shiftId = searchParams.get('shiftId')

  const where: Record<string, unknown> = {}
  if (session.user.role === 'provider') {
    // Providers see only their center's patients
    if (session.user.center) where.center = session.user.center
    else where.shiftId = session.user.shiftId
  } else if (shiftId) {
    where.shiftId = parseInt(shiftId)
  }

  const patients = await prisma.patient.findMany({
    where,
    include: {
      shift: { select: { id: true, name: true, schedule: true, timeOfDay: true } },
      _count: { select: { promResponses: true } },
    },
    orderBy: [{ center: 'asc' }, { patientCode: 'asc' }],
  })

  // Never return PIN hashes to the client
  return NextResponse.json(patients.map(({ pin: _pin, pinIndexHash: _idx, ...p }) => p))
}

// ── POST /api/patients ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { patientCode, pin, shiftId, enrollmentDate, center, dialysisSchedule, customDialysisDays, notes } = body

  if (!patientCode || !pin || !shiftId || !enrollmentDate) {
    return NextResponse.json({ error: 'patientCode, pin, shiftId, and enrollmentDate are required' }, { status: 400 })
  }

  if (!validatePin(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 6 digits' }, { status: 400 })
  }

  const [pinHash, indexHash] = await Promise.all([
    bcrypt.hash(pin, 12),
    Promise.resolve(pinIndexHash(pin)),
  ])

  const patient = await prisma.patient.create({
    data: {
      patientCode: patientCode.toUpperCase(),
      pin: pinHash,
      pinIndexHash: indexHash,
      shiftId,
      center: center ?? 'Feldbach',
      dialysisSchedule: dialysisSchedule ?? 'MWF',
      customDialysisDays: customDialysisDays ?? null,
      enrollmentDate: new Date(enrollmentDate),
      notes: notes ?? null,
    },
    include: { shift: { select: { name: true } } },
  })

  const { pin: _pin, pinIndexHash: _idx, ...safePatient } = patient
  return NextResponse.json(safePatient, { status: 201 })
}
