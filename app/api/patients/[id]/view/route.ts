import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { writeAudit, getIp } from '@/lib/audit'

// POST /api/patients/[id]/view
// Called when a provider or admin expands a patient card to view longitudinal data.
// Logs to the tamper-evident audit chain for GDPR accountability (Art. 5(2)).
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
  if (isNaN(patientId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  // Verify the patient exists and the provider is allowed to see them
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { center: true, isActive: true },
  })
  if (!patient) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role === 'provider') {
    if (!session.user.center || patient.center !== session.user.center) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  writeAudit({
    actorType:  session.user.role,
    actorId:    session.user.providerId ?? null,
    action:     'view',
    resource:   'patient',
    resourceId: patientId,
    ip:         getIp(req),
  })

  return NextResponse.json({ ok: true })
}
