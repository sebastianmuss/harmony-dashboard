import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { writeAudit, getIp } from '@/lib/audit'

// POST /api/patients/[id]/override
// Creates a one-time "treat as on HD today" override for a patient.
// Providers can only override patients in their own center.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !['provider', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const patientId = parseInt(id)
  if (isNaN(patientId)) return NextResponse.json({ error: 'Invalid patient id' }, { status: 400 })

  // Verify patient exists and belongs to provider's center
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, center: true, isActive: true },
  })
  if (!patient || !patient.isActive) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }
  // Providers with no center assignment are blocked; providers with a center
  // can only access patients in that same center.
  if (session.user.role === 'provider') {
    if (!session.user.center || patient.center !== session.user.center) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await req.json().catch(() => ({}))
  const dateStr: string = body.date ?? new Date().toISOString().slice(0, 10)
  const date = new Date(dateStr)
  date.setUTCHours(0, 0, 0, 0)

  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  await prisma.dailyScheduleOverride.upsert({
    where: { patientId_date: { patientId, date } },
    update: {},
    create: { patientId, date },
  })

  return NextResponse.json({ success: true })
}

// DELETE /api/patients/[id]/override?date=YYYY-MM-DD
// Removes an override (provider changes their mind).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !['provider', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const patientId = parseInt(id)
  if (isNaN(patientId)) return NextResponse.json({ error: 'Invalid patient id' }, { status: 400 })

  // Verify patient exists and belongs to provider's center
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, center: true },
  })
  if (!patient) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'provider') {
    if (!session.user.center || patient.center !== session.user.center) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const dateStr = new URL(req.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const date = new Date(dateStr)
  date.setUTCHours(0, 0, 0, 0)

  await prisma.dailyScheduleOverride.deleteMany({
    where: { patientId, date },
  })

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'delete',
    resource: 'schedule_override',
    resourceId: patientId,
    changes: { patientId, date: dateStr },
    ip: getIp(req),
  })

  return NextResponse.json({ success: true })
}
