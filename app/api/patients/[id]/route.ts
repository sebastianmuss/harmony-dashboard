import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { pinIndexHash, validatePin } from '@/lib/pin'

// ── PATCH /api/patients/[id] ──────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const patientId = parseInt(id)
  const body = await req.json()

  const update: Record<string, unknown> = {}
  if (body.patientCode !== undefined) update.patientCode = body.patientCode.toUpperCase()
  if (body.shiftId !== undefined) update.shiftId = body.shiftId
  if (body.center !== undefined) update.center = body.center
  if (body.dialysisSchedule !== undefined) update.dialysisSchedule = body.dialysisSchedule
  if (body.customDialysisDays !== undefined) update.customDialysisDays = body.customDialysisDays ?? null
  if (body.enrollmentDate !== undefined) update.enrollmentDate = new Date(body.enrollmentDate)
  if (body.isActive !== undefined) update.isActive = body.isActive
  if (body.droppedOutAt !== undefined) update.droppedOutAt = body.droppedOutAt ? new Date(body.droppedOutAt) : null
  if (body.notes !== undefined) update.notes = body.notes
  if (body.dryWeight !== undefined) update.dryWeight = body.dryWeight ? parseFloat(body.dryWeight) : null
  if (body.pin !== undefined) {
    if (!validatePin(body.pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 6 digits' }, { status: 400 })
    }
    update.pin = await bcrypt.hash(body.pin, 12)
    update.pinIndexHash = pinIndexHash(body.pin)
  }

  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: update,
    include: { shift: { select: { name: true, schedule: true } } },
  })

  const { pin: _pin, pinIndexHash: _idx, ...safePatient } = patient
  return NextResponse.json(safePatient)
}

// ── DELETE /api/patients/[id] — soft delete (deactivate) ─────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const patientId = parseInt(id)

  await prisma.patient.update({
    where: { id: patientId },
    data: { isActive: false, droppedOutAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
