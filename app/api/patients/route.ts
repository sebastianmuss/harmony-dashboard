import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { isPasswordValid } from '@/lib/password'
import { encrypt, decrypt } from '@/lib/crypto'
import { writeAudit, getIp } from '@/lib/audit'
import { generateResetToken } from '@/lib/token'
import { z } from 'zod'
import logger from '@/lib/logger'

const CreatePatientSchema = z.object({
  // patientCode is auto-generated server-side — not accepted from client
  name:               z.string().max(120).optional().nullable(),
  pin:                z.string().superRefine((p, ctx) => { if (!isPasswordValid(p)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Password must be at least 12 characters and include upper, lower, digit, and special character.' }) }).optional(),
  shiftId:            z.int().positive(),
  enrollmentDate:     z.string().date(),
  center:             z.string().min(1).optional(),
  dialysisSchedule:   z.enum(['MWF', 'TThS', 'custom']).optional(),
  customDialysisDays: z.string().optional().nullable(),
  notes:              z.string().optional().nullable(),
})

/** Returns the next HMY-XXXX code not yet taken in the DB. */
async function nextPatientCode(): Promise<string> {
  // Find the highest existing numeric suffix
  const last = await prisma.patient.findFirst({
    where: { patientCode: { startsWith: 'HMY-' } },
    orderBy: { patientCode: 'desc' },
    select: { patientCode: true },
  })
  const lastNum = last ? parseInt(last.patientCode.replace('HMY-', ''), 10) : 0
  const candidate = `HMY-${String(lastNum + 1).padStart(4, '0')}`
  // Guard against the unlikely race: if already taken, find the true max
  const taken = await prisma.patient.findUnique({ where: { patientCode: candidate } })
  if (!taken) return candidate
  const all = await prisma.patient.findMany({ where: { patientCode: { startsWith: 'HMY-' } }, select: { patientCode: true } })
  const nums = all.map((p) => parseInt(p.patientCode.replace('HMY-', ''), 10)).filter(Number.isFinite)
  return `HMY-${String(Math.max(...nums) + 1).padStart(4, '0')}`
}

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

  // Never return PIN hashes; names are not exposed to admins (data minimisation)
  return NextResponse.json(patients.map(({ pin: _pin, pinIndexHash: _idx, nameEncrypted: _name, promResponses, ...p }) => ({
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
  const { name, pin, shiftId, enrollmentDate, center, dialysisSchedule, customDialysisDays, notes } = parsed.data

  const patientCode = await nextPatientCode()

  // If admin doesn't provide a pin, create a locked (unusable) hash — user must set via reset token
  const pinHash = pin ? await bcrypt.hash(pin, 12) : await bcrypt.hash(randomUUID(), 12)

  const patient = await prisma.patient.create({
    data: {
      patientCode,
      nameEncrypted: name ? encrypt(name) : null,
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

  // Auto-generate a one-time reset token so admin can hand it to the patient immediately
  const { code, hash: tokenHash, expiry } = generateResetToken()
  await prisma.patient.update({ where: { id: patient.id }, data: { resetToken: tokenHash, resetTokenExpiry: expiry } })

  const { pin: _pin, pinIndexHash: _idx, nameEncrypted, ...safePatient } = patient

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'create',
    resource: 'patient',
    resourceId: patient.id,
    changes: { patientCode: patient.patientCode, center: patient.center, shiftId: patient.shiftId },
    ip: getIp(req),
  })

  return NextResponse.json({ ...safePatient, name: name ?? null, resetCode: code, resetExpiry: expiry.toISOString() }, { status: 201 })
}
