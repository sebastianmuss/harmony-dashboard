import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { writeAudit, getIp } from '@/lib/audit'

// GET /api/admin/export?type=prom|clinical&center=
// Returns a CSV download with one row per patient per session date.
// Columns include center, patient code, who entered (patient vs provider).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'prom'
  const center = searchParams.get('center') ?? null

  const patientWhere = center ? { center } : {}

  if (type === 'prom') {
    const rows = await prisma.promResponse.findMany({
      where: center ? { patient: { center } } : {},
      include: {
        patient: { select: { patientCode: true, center: true } },
      },
      orderBy: [{ patientId: 'asc' }, { sessionDate: 'asc' }],
    })

    // Determine who entered each PROM: check ActivityLog for prom_submit on that date
    // actorType='patient' → patient, actorType='provider'|'admin' → provider
    const activityLogs = await prisma.activityLog.findMany({
      where: { eventType: 'prom_submit' },
      select: { actorType: true, actorId: true, createdAt: true },
    })

    const header = 'patient_code,center,date,study_week,timepoint,fluid_status,thirst,fluid_overload,submitted_at,entered_by\n'
    const csv = rows.map((r) => {
      const dateStr = r.sessionDate.toISOString().slice(0, 10)
      const submittedAt = r.submittedAt.toISOString()
      const matchLog = activityLogs.find(
        (l) =>
          l.actorId === r.patientId &&
          l.actorType === 'patient' &&
          l.createdAt.toISOString().slice(0, 10) === dateStr
      )
      const enteredBy = matchLog ? 'patient' : 'provider'
      return [
        r.patient.patientCode,
        r.patient.center,
        dateStr,
        r.studyWeek,
        r.timepointReference,
        r.fluidStatusScore,
        r.thirstScore,
        r.fluidOverloadScore,
        submittedAt,
        enteredBy,
      ].map(csvCell).join(',')
    }).join('\n')

    writeAudit({
      actorType: session.user.role,
      actorId: session.user.providerId ?? null,
      action: 'export',
      resource: 'prom',
      changes: { rowCount: rows.length, center: center ?? 'all' },
      ip: getIp(req),
    })

    return new NextResponse(header + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="harmony_prom_export_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  if (type === 'clinical') {
    const rows = await prisma.clinicalData.findMany({
      where: center ? { patient: { center } } : {},
      include: {
        patient: { select: { patientCode: true, center: true } },
      },
      orderBy: [{ patientId: 'asc' }, { sessionDate: 'asc' }],
    })

    const header = 'patient_code,center,date,pre_dialysis_weight_kg,idwg_kg,systolic_bp_mmhg,diastolic_bp_mmhg,recorded_at\n'
    const csv = rows.map((r) => [
      r.patient.patientCode,
      r.patient.center,
      r.sessionDate.toISOString().slice(0, 10),
      r.preDialysisWeight ?? '',
      r.interdialyticWeightGain ?? '',
      r.systolicBp ?? '',
      r.diastolicBp ?? '',
      r.recordedAt.toISOString(),
    ].map(csvCell).join(',')).join('\n')

    writeAudit({
      actorType: session.user.role,
      actorId: session.user.providerId ?? null,
      action: 'export',
      resource: 'clinical',
      changes: { rowCount: rows.length, center: center ?? 'all' },
      ip: getIp(req),
    })

    return new NextResponse(header + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="harmony_clinical_export_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({ error: 'Invalid type — use prom or clinical' }, { status: 400 })
}

// Wrap every value in double-quotes and escape internal quotes.
// Prevents CSV formula injection when files are opened in Excel/LibreOffice.
function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}
