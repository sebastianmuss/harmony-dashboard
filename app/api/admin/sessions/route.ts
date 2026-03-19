import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/admin/sessions
// Returns users who have logged in within the last 8 hours (likely have active JWTs).
// Since sessions are JWTs (stored in cookies, not DB) we derive active users from
// the activity log and cross-reference with auth_users.kickedAt.
export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - 8 * 60 * 60 * 1000)

  // Get most recent login per user within the session window
  const recentLogins = await prisma.activityLog.findMany({
    where: { eventType: 'login', createdAt: { gt: since } },
    orderBy: { createdAt: 'desc' },
  })

  // Deduplicate: keep most recent login per actorId+actorType
  const seen = new Set<string>()
  const unique = recentLogins.filter((l) => {
    const key = `${l.actorType}-${l.actorId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Look up auth_users for each active user
  const userIds = unique.map((l) =>
    l.actorType === 'patient' ? `patient-${l.actorId}` : `provider-${l.actorId}`
  ).filter(Boolean)

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, role: true, center: true, patientCode: true, kickedAt: true },
  })

  const userMap = new Map(users.map((u) => [u.id, u]))

  const result = unique.map((l) => {
    const userId = l.actorType === 'patient' ? `patient-${l.actorId}` : `provider-${l.actorId}`
    const user = userMap.get(userId)
    return {
      userId,
      name:      user?.name ?? null,
      role:      user?.role ?? l.actorType,
      center:    user?.center ?? l.center,
      patientCode: user?.patientCode ?? null,
      loginAt:   l.createdAt,
      kickedAt:  user?.kickedAt ?? null,
    }
  })

  return NextResponse.json(result)
}

// POST /api/admin/sessions/kick — revoke a user's JWT by setting kickedAt
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Prevent self-kick
  if (userId === session.user.id) {
    return NextResponse.json({ error: 'Cannot kick your own session' }, { status: 400 })
  }

  await prisma.user.update({
    where:  { id: userId },
    data:   { kickedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
