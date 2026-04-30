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
  const providerId = parseInt(id)

  const { code, hash, expiry } = generateResetToken()

  await prisma.provider.update({
    where: { id: providerId },
    data: { resetToken: hash, resetTokenExpiry: expiry },
  })

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'reset_token',
    resource: 'provider',
    resourceId: providerId,
    ip: getIp(req),
  })

  return NextResponse.json({ code, expiry })
}
