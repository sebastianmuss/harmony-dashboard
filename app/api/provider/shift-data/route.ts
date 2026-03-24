import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getCurrentStudyWeek, getTimepointForWeek, isLongGapSession, isDialysisDay } from '@/lib/study'

// ── GET /api/provider/shift-data ──────────────────────────────────────────────
// Returns today's shift patient list with PROM history + clinical data
export async function GET() {
  const session = await auth()
  if (!session || !['provider', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shiftId = session.user.shiftId
  const providerCenter = session.user.center ?? null

  if (!shiftId && !providerCenter && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'No shift or center assigned' }, { status: 400 })
  }

  // Fire-and-forget: log this data view
  prisma.activityLog.create({
    data: {
      eventType: 'data_view',
      actorType: session.user.role,
      actorId: session.user.providerId ?? null,
      center: session.user.center ?? null,
      shiftId: session.user.shiftId ?? null,
    },
  }).catch(() => {})

  const config = await prisma.studyConfig.findFirst()
  const studyWeek = config ? getCurrentStudyWeek(config.studyStartDate) : null
  const timepoint = studyWeek ? getTimepointForWeek(studyWeek) : null

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // Build patient filter: providers see their center's patients; admins see all
  const patientWhere: Record<string, unknown> = { isActive: true }
  if (session.user.role === 'provider') {
    if (providerCenter) {
      patientWhere.center = providerCenter
    } else if (shiftId) {
      patientWhere.shiftId = shiftId
    }
  }

  // Load today's overrides
  const todayOverrides = await prisma.dailyScheduleOverride.findMany({
    where: { date: today },
    select: { patientId: true },
  })
  const overridePatientIds = new Set(todayOverrides.map((o) => o.patientId))

  const patients = await prisma.patient.findMany({
    where: patientWhere,
    include: {
      shift: { select: { name: true, schedule: true } },
      promResponses: {
        orderBy: { sessionDate: 'asc' },
        select: {
          id: true,
          sessionDate: true,
          studyWeek: true,
          timepointReference: true,
          fluidStatusScore: true,
          thirstScore: true,
          fluidOverloadScore: true,
          submittedAt: true,
        },
      },
      clinicalData: {
        orderBy: { sessionDate: 'asc' },
        select: {
          sessionDate: true,
          preDialysisWeight: true,
          interdialyticWeightGain: true,
          systolicBp: true,
          diastolicBp: true,
        },
      },
    },
    orderBy: [{ center: 'asc' }, { patientCode: 'asc' }],
  })

  const enrichedPatients = patients.map((patient) => {
    const todayProm = patient.promResponses.find(
      (r) => new Date(r.sessionDate).toDateString() === today.toDateString()
    )

    const todayClinical = patient.clinicalData.find(
      (c) => new Date(c.sessionDate).toDateString() === today.toDateString()
    )

    const isLongGap = isLongGapSession(today, patient.dialysisSchedule, patient.customDialysisDays)
    const scheduledHD = isDialysisDay(today, patient.dialysisSchedule, patient.customDialysisDays)
    const hasOverride = overridePatientIds.has(patient.id)
    const onHDToday = scheduledHD || hasOverride

    const lastProm = patient.promResponses.at(-1)
    const lastClinical = patient.clinicalData.at(-1)

    return {
      id: patient.id,
      patientCode: patient.patientCode,
      center: patient.center,
      shiftName: patient.shift.name,
      schedule: patient.dialysisSchedule,
      customDialysisDays: patient.customDialysisDays,
      enrollmentDate: patient.enrollmentDate,
      dryWeight: patient.dryWeight ? Number(patient.dryWeight) : null,
      isLongGapToday: isLongGap,
      onHDToday,
      hdOverrideActive: hasOverride,
      submittedToday: !!todayProm,
      todayProm: todayProm ?? null,
      todayClinical: todayClinical ?? null,
      promHistory: patient.promResponses,
      clinicalHistory: patient.clinicalData,
      lastPromDate: lastProm?.sessionDate ?? null,
      lastClinicalDate: lastClinical?.sessionDate ?? null,
    }
  })

  return NextResponse.json({
    shiftId,
    studyWeek,
    studyStartDate: config?.studyStartDate?.toISOString() ?? null,
    currentTimepoint: timepoint,
    today: today.toISOString(),
    patients: enrichedPatients,
  })
}
