import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { subDays, startOfDay, format } from 'date-fns'

// ── GET /api/admin/activity ────────────────────────────────────────────────────
// Returns usage stats: per-patient, per-provider, per-center, and daily (last 30d)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since30d = startOfDay(subDays(new Date(), 29))

  // ── Raw activity logs ──────────────────────────────────────────────────────
  const [allLogs, patients, providers] = await Promise.all([
    prisma.activityLog.findMany({
      where: { createdAt: { gte: since30d } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.patient.findMany({
      select: {
        id: true,
        patientCode: true,
        center: true,
        shiftId: true,
        isActive: true,
        _count: { select: { promResponses: true } },
        promResponses: { orderBy: { submittedAt: 'desc' }, take: 1, select: { submittedAt: true } },
      },
    }),
    prisma.provider.findMany({
      select: { id: true, name: true, center: true, role: true, isActive: true },
    }),
  ])

  // All-time login counts (not limited to 30d)
  const allTimeLogs = await prisma.activityLog.findMany({
    select: { eventType: true, actorType: true, actorId: true, createdAt: true },
  })

  // ── Per-patient activity ───────────────────────────────────────────────────
  const patientActivity = patients.map((p) => {
    const logins = allTimeLogs.filter(
      (l) => l.eventType === 'login' && l.actorType === 'patient' && l.actorId === p.id
    )
    return {
      patientId: p.id,
      patientCode: p.patientCode,
      center: p.center,
      isActive: p.isActive,
      loginCount: logins.length,
      promCount: p._count.promResponses,
      lastLogin: logins.length ? logins[logins.length - 1].createdAt.toISOString() : null,
      lastProm: p.promResponses[0]?.submittedAt.toISOString() ?? null,
    }
  })

  // ── Per-provider activity ──────────────────────────────────────────────────
  const providerActivity = providers.map((p) => {
    const logins = allTimeLogs.filter(
      (l) => l.eventType === 'login' && l.actorType !== 'patient' && l.actorId === p.id
    )
    const views = allTimeLogs.filter(
      (l) => l.eventType === 'data_view' && l.actorId === p.id
    )
    return {
      providerId: p.id,
      name: p.name,
      center: p.center,
      role: p.role,
      isActive: p.isActive,
      loginCount: logins.length,
      viewCount: views.length,
      promCount: allTimeLogs.filter(
        (l) => l.eventType === 'prom_submit' && (l.actorType === 'provider' || l.actorType === 'admin') && l.actorId === p.id
      ).length,
      lastLogin: logins.length ? logins[logins.length - 1].createdAt.toISOString() : null,
      lastView: views.length ? views[views.length - 1].createdAt.toISOString() : null,
    }
  })

  // ── Per-center summary (all-time) ─────────────────────────────────────────
  const centers = [...new Set([...patients.map((p) => p.center), ...providers.map((p) => p.center ?? '')])]
    .filter(Boolean)
  const centerActivity = centers.map((center) => {
    const patientIds = patients.filter((p) => p.center === center).map((p) => p.id)
    const providerIds = providers.filter((p) => p.center === center).map((p) => p.id)
    return {
      center,
      patientLogins: allTimeLogs.filter(
        (l) => l.eventType === 'login' && l.actorType === 'patient' && l.actorId !== null && patientIds.includes(l.actorId)
      ).length,
      providerLogins: allTimeLogs.filter(
        (l) => l.eventType === 'login' && l.actorType !== 'patient' && l.actorId !== null && providerIds.includes(l.actorId)
      ).length,
      promSubmits: allTimeLogs.filter(
        (l) => l.eventType === 'prom_submit' && l.actorId !== null && patientIds.includes(l.actorId)
      ).length,
      dataViews: allTimeLogs.filter(
        (l) => l.eventType === 'data_view' && l.actorId !== null && providerIds.includes(l.actorId)
      ).length,
    }
  })

  // ── Daily activity (last 30 days) ─────────────────────────────────────────
  const dailyMap: Record<string, { logins: number; proms: number; views: number }> = {}
  for (let i = 29; i >= 0; i--) {
    dailyMap[subDays(new Date(), i).toISOString().slice(0, 10)] = { logins: 0, proms: 0, views: 0 }
  }
  for (const log of allLogs) {
    const day = log.createdAt.toISOString().slice(0, 10)
    if (!dailyMap[day]) continue
    if (log.eventType === 'login') dailyMap[day].logins++
    else if (log.eventType === 'prom_submit') dailyMap[day].proms++
    else if (log.eventType === 'data_view') dailyMap[day].views++
  }
  const dailyActivity = Object.entries(dailyMap).map(([date, counts]) => ({ date, ...counts }))

  return NextResponse.json({ patientActivity, providerActivity, centerActivity, dailyActivity })
}
