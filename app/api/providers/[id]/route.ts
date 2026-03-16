import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

// ── PATCH /api/providers/[id] ─────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
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
  return NextResponse.json(safeProvider)
}
