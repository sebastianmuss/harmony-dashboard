import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { writeAudit, getIp } from '@/lib/audit'
import { generateResetToken } from '@/lib/token'
import { z } from 'zod'
import { isPasswordValid } from '@/lib/password'

const CreateProviderSchema = z.object({
  name:     z.string().min(1).max(200),
  username: z.string().min(3).max(100),
  password: z.string().min(12).max(128).refine(isPasswordValid, {
    message: 'Password must be at least 12 characters and include uppercase, lowercase, digit, and special character',
  }).optional(),
  role:     z.enum(['provider', 'admin']),
  shiftId:  z.number().int().positive().nullable().optional(),
  center:   z.string().max(100).nullable().optional(),
})

// ── GET /api/providers ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth()
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
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = await req.json()
  const parsed = CreateProviderSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }
  const { name, username, password, role, shiftId, center } = parsed.data

  const existing = await prisma.provider.findUnique({ where: { username } })
  if (existing) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
  }

  // If admin doesn't provide a password, create a locked (unusable) hash — user must set via reset token
  const passwordHash = password ? await bcrypt.hash(password, 12) : await bcrypt.hash(randomUUID(), 12)

  const provider = await prisma.provider.create({
    data: { name, username, passwordHash, role, shiftId: shiftId ?? null, center: center ?? null },
    include: { shift: { select: { name: true } } },
  })

  // Auto-generate a one-time reset token so admin can hand it to the provider immediately
  const { code, hash: tokenHash, expiry } = generateResetToken()
  await prisma.provider.update({ where: { id: provider.id }, data: { resetToken: tokenHash, resetTokenExpiry: expiry } })

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

  return NextResponse.json({ ...safeProvider, resetCode: code, resetExpiry: expiry.toISOString() }, { status: 201 })
}
