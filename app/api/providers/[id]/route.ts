import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { writeAudit, getIp } from '@/lib/audit'

// ── PATCH /api/providers/[id] ─────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const providerId = parseInt(id)
  const body = await req.json()

  const update: Record<string, unknown> = {}
  if (body.name !== undefined) update.name = body.name
  if (body.username !== undefined) update.username = body.username
  if (body.role !== undefined) update.role = body.role
  if (body.shiftId !== undefined) update.shiftId = body.shiftId ?? null
  if (body.center !== undefined) update.center = body.center ?? null
  if (body.isActive !== undefined) update.isActive = body.isActive
  if (body.password !== undefined) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    update.passwordHash = await bcrypt.hash(body.password, 12)
  }

  const provider = await prisma.provider.update({
    where: { id: providerId },
    data: update,
    include: { shift: { select: { name: true } } },
  })

  const { passwordHash: _h, ...safeProvider } = provider

  const loggedChanges = Object.fromEntries(
    Object.entries(update).filter(([k]) => k !== 'passwordHash')
  )
  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'update',
    resource: 'provider',
    resourceId: providerId,
    changes: loggedChanges,
    ip: getIp(req),
  })

  return NextResponse.json(safeProvider)
}
