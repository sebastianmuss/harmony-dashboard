import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { isPasswordValid } from '@/lib/password'
import { encrypt, decrypt } from '@/lib/crypto'
import { writeAudit, getIp } from '@/lib/audit'

// ── PATCH /api/patients/[id] ──────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !['admin', 'provider'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const patientId = parseInt(id)
  const body = await req.json()

  const update: Record<string, unknown> = {}

  // Providers may only update the encrypted name field
  if (session.user.role === 'provider') {
    if (body.name !== undefined) update.nameEncrypted = body.name ? encrypt(body.name) : null
  } else {
    // patientCode is immutable — never accepted in updates
    if (body.shiftId !== undefined) update.shiftId = body.shiftId
    if (body.center !== undefined) update.center = body.center
    if (body.dialysisSchedule !== undefined) update.dialysisSchedule = body.dialysisSchedule
    if (body.customDialysisDays !== undefined) update.customDialysisDays = body.customDialysisDays ?? null
    if (body.enrollmentDate !== undefined) update.enrollmentDate = new Date(body.enrollmentDate)
    if (body.isActive !== undefined) update.isActive = body.isActive
    if (body.droppedOutAt !== undefined) update.droppedOutAt = body.droppedOutAt ? new Date(body.droppedOutAt) : null
    if (body.notes !== undefined) update.notes = body.notes
    if (body.dryWeight !== undefined) update.dryWeight = body.dryWeight ? parseFloat(body.dryWeight) : null
    // name (nameEncrypted) is intentionally excluded from admin path — only providers may set/change patient names
  }
  if (body.pin !== undefined) {
    if (!isPasswordValid(body.pin)) {
      return NextResponse.json({ error: 'Password must be at least 12 characters and include upper, lower, digit, and special character.' }, { status: 400 })
    }
    update.pin = await bcrypt.hash(body.pin, 12)
  }

  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: update,
    include: { shift: { select: { name: true, schedule: true } } },
  })

  const { pin: _pin, pinIndexHash: _idx, nameEncrypted, ...safePatient } = patient

  // Log changed fields (exclude PIN — already redacted from update object)
  const loggedChanges = Object.fromEntries(
    Object.entries(update).filter(([k]) => k !== 'pin' && k !== 'pinIndexHash')
  )
  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'update',
    resource: 'patient',
    resourceId: patientId,
    changes: loggedChanges,
    ip: getIp(req),
  })

  // Admins never receive the decrypted name
  const responseName = session.user.role === 'provider' && nameEncrypted ? decrypt(nameEncrypted) : null
  return NextResponse.json({ ...safePatient, name: responseName })
}

// ── DELETE /api/patients/[id] — soft delete (deactivate) ─────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const patientId = parseInt(id)

  await prisma.patient.update({
    where: { id: patientId },
    data: { isActive: false, droppedOutAt: new Date() },
  })

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'delete',
    resource: 'patient',
    resourceId: patientId,
    ip: getIp(req),
  })

  return NextResponse.json({ success: true })
}
