import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { isPasswordValid } from '@/lib/password'
import { writeAudit, getIp } from '@/lib/audit'
import { z } from 'zod'
import logger from '@/lib/logger'

const CreatePatientSchema = z.object({
  patientCode:        z.string().min(1).max(20).toUpperCase(),
  pin:                z.string().superRefine((p, ctx) => { if (!isPasswordValid(p)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Password must be at least 12 characters and include upper, lower, digit, and special character.' }) }),
  shiftId:            z.int().positive(),
  enrollmentDate:     z.string().date(),
  center:             z.string().min(1).optional(),
  dialysisSchedule:   z.enum(['MWF', 'TThS', 'custom']).optional(),
  customDialysisDays: z.string().optional().nullable(),
  notes:              z.string().optional().nullable(),
})

// ── GET /api/patients?shiftId= ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role === 'patient') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const shiftId = searchParams.get('shiftId')

  const where: Record<string, unknown> = {}
  if (session.user.role === 'provider') {
    // Providers MUST have a center — no center means no data access
    if (!session.user.center) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    where.center = session.user.center
  } else if (shiftId) {
    where.shiftId = parseInt(shiftId)
  }

  const patients = await prisma.patient.findMany({
    where,
    include: {
      shift: { select: { id: true, name: true, schedule: true, timeOfDay: true } },
      _count: { select: { promResponses: true } },
      promResponses: { orderBy: { sessionDate: 'desc' }, take: 1, select: { sessionDate: true } },
    },
    orderBy: [{ center: 'asc' }, { patientCode: 'asc' }],
  })

  // Never return PIN hashes to the client
  return NextResponse.json(patients.map(({ pin: _pin, pinIndexHash: _idx, promResponses, ...p }) => ({
    ...p,
    lastPromDate: promResponses[0]?.sessionDate ?? null,
  })))
}

// ── POST /api/patients ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = await req.json()
  const parsed = CreatePatientSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn({ path: '/api/patients', errors: parsed.error.flatten() }, 'Patient create validation failed')
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }
  const { patientCode, pin, shiftId, enrollmentDate, center, dialysisSchedule, customDialysisDays, notes } = parsed.data

  const pinHash = await bcrypt.hash(pin, 12)

  const patient = await prisma.patient.create({
    data: {
      patientCode,
      pin: pinHash,
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

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'create',
    resource: 'patient',
    resourceId: patient.id,
    changes: { patientCode: patient.patientCode, center: patient.center, shiftId: patient.shiftId },
    ip: getIp(req),
  })

  return NextResponse.json(safePatient, { status: 201 })
}
