import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { writeAudit, getIp } from '@/lib/audit'

// ── GET /api/providers ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const providers = await prisma.provider.findMany({
    include: { shift: { select: { id: true, name: true } } },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(providers.map(({ passwordHash: _h, ...p }) => p))
}

// ── POST /api/providers ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, username, password, role, shiftId, center } = body

  if (!name || !username || !password || !role) {
    return NextResponse.json({ error: 'name, username, password, and role are required' }, { status: 400 })
  }

  if (!['provider', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'role must be "provider" or "admin"' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const existing = await prisma.provider.findUnique({ where: { username } })
  if (existing) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const provider = await prisma.provider.create({
    data: { name, username, passwordHash, role, shiftId: shiftId ?? null, center: center ?? null },
    include: { shift: { select: { name: true } } },
  })

  const { passwordHash: _h, ...safeProvider } = provider

  writeAudit({
    actorType: session.user.role,
    actorId: session.user.providerId ?? null,
    action: 'create',
    resource: 'provider',
    resourceId: provider.id,
    changes: { name: provider.name, username: provider.username, role: provider.role, center: provider.center },
    ip: getIp(req),
  })

  return NextResponse.json(safeProvider, { status: 201 })
}
