import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getCurrentStudyWeek, getTimepointForWeek } from '@/lib/study'
import { writeAudit, getIp } from '@/lib/audit'
import { z } from 'zod'
import logger from '@/lib/logger'

const RECOVERY_TIME_OPTIONS = ['0-2h', '3-6h', '7-12h', '>12h'] as const

const PromSubmitSchema = z.object({
  fluidStatusScore:    z.int().min(1).max(5),
  thirstScore:         z.int().min(1).max(5),
  fluidOverloadScore:  z.int().min(1).max(5),
  recoveryTime:        z.enum(RECOVERY_TIME_OPTIONS).nullable().optional(),
  patientId:   z.int().positive().optional(),
  sessionDate: z.string().date().optional(),
})

const PromEditSchema = z.object({
  id:                  z.int().positive(),
  fluidStatusScore:    z.int().min(1).max(5),
  thirstScore:         z.int().min(1).max(5),
  fluidOverloadScore:  z.int().min(1).max(5),
  recoveryTime:        z.enum(RECOVERY_TIME_OPTIONS).nullable().optional(),
})

// ── GET /api/prom?patientId=&from=&to= ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const patientId = searchParams.get('patientId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (session.user.role === 'patient') {
    if (!session.user.patientId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const responses = await prisma.promResponse.findMany({
      where: { patientId: session.user.patientId },
      orderBy: { sessionDate: 'asc' },
    })
    return NextResponse.json(responses)
  }

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

  const responses = await prisma.promResponse.findMany({
    where,
    include: { patient: { select: { patientCode: true, shiftId: true, center: true } } },
    orderBy: [{ patientId: 'asc' }, { sessionDate: 'asc' }],
  })
  return NextResponse.json(responses)
}

// ── POST /api/prom ────────────────────────────────────────────────────────────
// Patients submit their own. Providers can submit on behalf of a patient
// by passing patientId + optionally sessionDate in the body.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json()
  const parsed = PromSubmitSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn({ path: '/api/prom', errors: parsed.error.flatten() }, 'PROM validation failed')
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }
  const { fluidStatusScore, thirstScore, fluidOverloadScore, recoveryTime } = parsed.data
  const body = parsed.data

  // Resolve the target patient
  let patientId: number
  if (session.user.role === 'patient') {
    if (!session.user.patientId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    patientId = session.user.patientId
  } else if (['provider', 'admin'].includes(session.user.role)) {
    if (!body.patientId) return NextResponse.json({ error: 'patientId required' }, { status: 400 })
    patientId = body.patientId
    // Providers can only submit for patients in their own center
    if (session.user.role === 'provider') {
      if (!session.user.center) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const target = await prisma.patient.findUnique({ where: { id: patientId }, select: { center: true } })
      if (!target || target.center !== session.user.center) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  } else {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve session date (providers may specify; defaults to today)
  const sessionDate = body.sessionDate ? new Date(body.sessionDate) : new Date()
  sessionDate.setUTCHours(0, 0, 0, 0)

  // Get study config
  const config = await prisma.studyConfig.findFirst()
  if (!config) return NextResponse.json({ error: 'Study not configured' }, { status: 503 })

  const studyWeek = getCurrentStudyWeek(config.studyStartDate, sessionDate)
  if (!studyWeek) return NextResponse.json({ error: 'Study is not currently active for this date' }, { status: 400 })

  const timepointReference = getTimepointForWeek(studyWeek)

  // Check for duplicate
  const existing = await prisma.promResponse.findUnique({
    where: { patientId_sessionDate: { patientId, sessionDate } },
  })
  if (existing) {
    return NextResponse.json({ error: 'Already submitted for this session', existing }, { status: 409 })
  }

  const response = await prisma.promResponse.create({
    data: {
      patientId,
      sessionDate,
      studyWeek,
      timepointReference,
      fluidStatusScore,
      thirstScore,
      fluidOverloadScore,
      recoveryTime: recoveryTime ?? null,
    },
  })

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.patientId ?? session.user.providerId ?? null,
    action: 'create',
    resource: 'prom',
    resourceId: response.id,
    changes: { patientId, sessionDate: sessionDate.toISOString().slice(0, 10), fluidStatusScore, thirstScore, fluidOverloadScore, recoveryTime: recoveryTime ?? null },
    ip: getIp(req),
  })

  // Fire-and-forget activity log
  prisma.activityLog.create({
    data: {
      eventType: 'prom_submit',
      actorType: session.user.role,
      actorId: session.user.patientId ?? session.user.providerId ?? null,
      center: session.user.center ?? null,
      shiftId: session.user.shiftId ?? null,
    },
  }).catch(() => {})

  return NextResponse.json(response, { status: 201 })
}

// ── PATCH /api/prom — same-day edits by patient or provider ──────────────────
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json()
  const parsed = PromEditSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }
  const { id, fluidStatusScore, thirstScore, fluidOverloadScore, recoveryTime } = parsed.data

  const prom = await prisma.promResponse.findUnique({
    where: { id },
    include: { patient: { select: { center: true } } },
  })
  if (!prom) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Patients can only edit their own PROM
  if (session.user.role === 'patient') {
    if (prom.patientId !== session.user.patientId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Providers can only edit PROMs in their center
  if (session.user.role === 'provider') {
    if (!session.user.center || prom.patient.center !== session.user.center) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Only allow edits on the same day the PROM was created
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const promDate = new Date(prom.sessionDate)
  promDate.setUTCHours(0, 0, 0, 0)
  if (promDate.getTime() !== today.getTime()) {
    return NextResponse.json({ error: 'PROMs can only be edited on the same day they were submitted' }, { status: 403 })
  }

  const updated = await prisma.promResponse.update({
    where: { id },
    data: { fluidStatusScore, thirstScore, fluidOverloadScore, recoveryTime: recoveryTime ?? null },
  })

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.patientId ?? session.user.providerId ?? null,
    action: 'update',
    resource: 'prom',
    resourceId: id,
    changes: { fluidStatusScore, thirstScore, fluidOverloadScore, recoveryTime: recoveryTime ?? null },
    ip: getIp(req),
  })

  return NextResponse.json(updated)
}

// ── DELETE /api/prom?id= — providers/admins can delete a response ─────────────
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session || !['provider', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Verify the PROM exists and belongs to a patient in the provider's center
  const prom = await prisma.promResponse.findUnique({
    where: { id: parseInt(id) },
    include: { patient: { select: { center: true } } },
  })
  if (!prom) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'provider') {
    if (!session.user.center || prom.patient.center !== session.user.center) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  await prisma.promResponse.delete({ where: { id: prom.id } })

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'delete',
    resource: 'prom',
    resourceId: prom.id,
    changes: { patientId: prom.patientId, sessionDate: prom.sessionDate },
    ip: getIp(req),
  })

  return NextResponse.json({ success: true })
}
