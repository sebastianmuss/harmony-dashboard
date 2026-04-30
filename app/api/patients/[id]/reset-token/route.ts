import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateResetToken } from '@/lib/token'
import { writeAudit, getIp } from '@/lib/audit'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const patientId = parseInt(id)

  const { code, hash, expiry } = generateResetToken()

  await prisma.patient.update({
    where: { id: patientId },
    data: { resetToken: hash, resetTokenExpiry: expiry },
  })

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'reset_token',
    resource: 'patient',
    resourceId: patientId,
    ip: getIp(req),
  })

  // Return the plaintext code once — never stored
  return NextResponse.json({ code, expiry })
}
