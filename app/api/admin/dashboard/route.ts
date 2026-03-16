import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getCurrentStudyWeek } from '@/lib/study'

// ── GET /api/admin/dashboard ──────────────────────────────────────────────────
// Returns aggregated feasibility metrics for the admin dashboard
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await prisma.studyConfig.findFirst()
  const studyWeek = config ? getCurrentStudyWeek(config.studyStartDate) : null

  // Recruitment
  const totalPatients = await prisma.patient.count()
  const activePatients = await prisma.patient.count({ where: { isActive: true } })
  const droppedOut = await prisma.patient.count({ where: { isActive: false } })

  // Completion rates per study week
  // "submitted" = unique patients who submitted at least once in that week (patient-level metric)
  const weeklyStats: { week: number; submitted: number; expected: number; rate: number }[] = []
  for (let week = 1; week <= 12; week++) {
    const rows = await prisma.promResponse.findMany({
      where: { studyWeek: week },
      select: { patientId: true },
      distinct: ['patientId'],
    })
    const submitted = rows.length
    weeklyStats.push({
      week,
      submitted,
      expected: activePatients,
      rate: activePatients > 0 ? Math.round((submitted / activePatients) * 100) : 0,
    })
  }

  // Response rates by shift
  const shifts = await prisma.shift.findMany({ orderBy: { sortOrder: 'asc' } })
  const shiftStats = await Promise.all(
    shifts.map(async (shift) => {
      const shiftPatients = await prisma.patient.count({ where: { shiftId: shift.id, isActive: true } })
      const shiftResponses = await prisma.promResponse.count({
        where: { patient: { shiftId: shift.id } },
      })
      return {
        shiftId: shift.id,
        shiftName: shift.name,
        schedule: shift.schedule,
        patients: shiftPatients,
        totalResponses: shiftResponses,
      }
    })
  )

  // Today's submissions
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayCount = await prisma.promResponse.count({
    where: { sessionDate: today },
  })

  // Overall response rate (all sessions to date)
  const totalResponses = await prisma.promResponse.count()

  // Per-week completion for active patients (expected vs actual)
  const patientsByWeek = studyWeek
    ? Array.from({ length: studyWeek }, (_, i) => i + 1).map((week) => {
        const stat = weeklyStats.find((s) => s.week === week)
        return stat ?? { week, submitted: 0, expected: activePatients, rate: 0 }
      })
    : []

  return NextResponse.json({
    recruitment: { total: totalPatients, active: activePatients, droppedOut },
    currentStudyWeek: studyWeek,
    todaySubmissions: todayCount,
    totalResponses,
    weeklyStats,
    shiftStats,
    completionByWeek: patientsByWeek,
  })
}
