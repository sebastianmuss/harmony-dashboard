import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/admin/export-usage?type=patients|providers
// Returns a CSV with usage data (logins, views, PROM entries).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const type = new URL(req.url).searchParams.get('type') ?? 'patients'

  const allLogs = await prisma.activityLog.findMany({
    select: { eventType: true, actorType: true, actorId: true, createdAt: true },
  })

  if (type === 'patients') {
    const patients = await prisma.patient.findMany({
      select: {
        id: true, patientCode: true, center: true, isActive: true,
        _count: { select: { promResponses: true } },
        promResponses: { orderBy: { submittedAt: 'desc' }, take: 1, select: { submittedAt: true } },
      },
      orderBy: [{ center: 'asc' }, { patientCode: 'asc' }],
    })

    const header = 'patient_code,center,is_active,login_count,prom_count,last_login,last_prom\n'
    const csv = patients.map((p) => {
      const logins = allLogs.filter(
        (l) => l.eventType === 'login' && l.actorType === 'patient' && l.actorId === p.id
      )
      const lastLogin = logins.length ? logins[logins.length - 1].createdAt.toISOString() : ''
      const lastProm = p.promResponses[0]?.submittedAt.toISOString() ?? ''
      return [
        p.patientCode,
        p.center,
        p.isActive ? 'yes' : 'no',
        logins.length,
        p._count.promResponses,
        lastLogin,
        lastProm,
      ].join(',')
    }).join('\n')

    return new NextResponse(header + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="harmony_usage_patients_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  if (type === 'providers') {
    const providers = await prisma.provider.findMany({
      select: { id: true, name: true, center: true, role: true, isActive: true },
      orderBy: [{ center: 'asc' }, { name: 'asc' }],
    })

    const header = 'name,center,role,is_active,login_count,data_view_count,prom_entries,last_login,last_view\n'
    const csv = providers.map((p) => {
      const logins = allLogs.filter(
        (l) => l.eventType === 'login' && l.actorType !== 'patient' && l.actorId === p.id
      )
      const views = allLogs.filter(
        (l) => l.eventType === 'data_view' && l.actorId === p.id
      )
      const proms = allLogs.filter(
        (l) => l.eventType === 'prom_submit' && (l.actorType === 'provider' || l.actorType === 'admin') && l.actorId === p.id
      )
      const lastLogin = logins.length ? logins[logins.length - 1].createdAt.toISOString() : ''
      const lastView  = views.length  ? views[views.length - 1].createdAt.toISOString()   : ''
      return [
        `"${p.name}"`,
        p.center ?? '',
        p.role,
        p.isActive ? 'yes' : 'no',
        logins.length,
        views.length,
        proms.length,
        lastLogin,
        lastView,
      ].join(',')
    }).join('\n')

    return new NextResponse(header + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="harmony_usage_providers_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({ error: 'Invalid type — use patients or providers' }, { status: 400 })
}
