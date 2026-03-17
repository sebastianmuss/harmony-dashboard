import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getCurrentStudyWeek } from '@/lib/study'
import { addDays, startOfDay } from 'date-fns'

// ── GET /api/admin/dashboard?center= ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const center = new URL(req.url).searchParams.get('center') || null
  const patientWhere = center ? { center } : {}

  const config = await prisma.studyConfig.findFirst()
  const studyWeek = config ? getCurrentStudyWeek(config.studyStartDate) : null

  // All patients for this center (including dropped-out), with dropout date
  const allPatients = await prisma.patient.findMany({
    where: patientWhere,
    select: { id: true, isActive: true, droppedOutAt: true, shiftId: true },
  })
  const totalPatients   = allPatients.length
  const activePatients  = allPatients.filter((p) => p.isActive).length
  const droppedOut      = allPatients.filter((p) => !p.isActive).length

  // ── Weekly completion rates ─────────────────────────────────────────────────
  // For week N, expected = patients enrolled and not yet dropped out during that week
  const weeklyStats: { week: number; submitted: number; expected: number; rate: number }[] = []

  if (config) {
    const studyStart = startOfDay(config.studyStartDate)

    for (let week = 1; week <= 12; week++) {
      const weekStart = addDays(studyStart, (week - 1) * 7)
      const weekEnd   = addDays(studyStart, week * 7 - 1)

      // Expected in this week: not dropped out before the week started
      const expectedPatients = allPatients.filter((p) =>
        !p.droppedOutAt || startOfDay(p.droppedOutAt) >= weekStart
      )
      const expected = expectedPatients.length
      const expectedIds = new Set(expectedPatients.map((p) => p.id))

      const rows = await prisma.promResponse.findMany({
        where: {
          studyWeek: week,
          patientId: { in: [...expectedIds] },
        },
        select: { patientId: true },
        distinct: ['patientId'],
      })

      const submitted = rows.length
      weeklyStats.push({
        week,
        submitted,
        expected,
        rate: expected > 0 ? Math.round((submitted / expected) * 100) : 0,
      })
    }
  }

  // ── Shift stats with completion % ──────────────────────────────────────────
  const shifts = await prisma.shift.findMany({ orderBy: { sortOrder: 'asc' } })
  const shiftStats = await Promise.all(
    shifts.map(async (shift) => {
      const shiftPatientIds = allPatients
        .filter((p) => p.shiftId === shift.id)
        .map((p) => p.id)

      const shiftPatients = shiftPatientIds.length

      const [totalResponses, uniqueRows] = await Promise.all([
        prisma.promResponse.count({ where: { patientId: { in: shiftPatientIds } } }),
        prisma.promResponse.findMany({
          where: { patientId: { in: shiftPatientIds } },
          select: { patientId: true },
          distinct: ['patientId'],
        }),
      ])

      const uniqueSubmitters = uniqueRows.length
      return {
        shiftId: shift.id,
        shiftName: shift.name,
        schedule: shift.schedule,
        patients: shiftPatients,
        totalResponses,
        uniqueSubmitters,
        completionPct: shiftPatients > 0 ? Math.round((uniqueSubmitters / shiftPatients) * 100) : 0,
      }
    })
  )

  // Today's submissions
  const today = startOfDay(new Date())
  const todayCount = await prisma.promResponse.count({
    where: { sessionDate: today, ...(center ? { patient: { center } } : {}) },
  })

  const totalResponses = await prisma.promResponse.count({
    where: center ? { patient: { center } } : {},
  })

  return NextResponse.json({
    recruitment: { total: totalPatients, active: activePatients, droppedOut },
    currentStudyWeek: studyWeek,
    todaySubmissions: todayCount,
    totalResponses,
    weeklyStats,
    shiftStats,
  })
}
