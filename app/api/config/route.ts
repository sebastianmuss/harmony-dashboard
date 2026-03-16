import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getCurrentStudyWeek, getTimepointForWeek } from '@/lib/study'

// ── GET /api/config ───────────────────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await prisma.studyConfig.findFirst()
  if (!config) return NextResponse.json({ configured: false })

  const studyWeek = getCurrentStudyWeek(config.studyStartDate)
  const timepoint = studyWeek ? getTimepointForWeek(studyWeek) : null

  return NextResponse.json({
    configured: true,
    id: config.id,
    studyStartDate: config.studyStartDate,
    studyName: config.studyName,
    currentStudyWeek: studyWeek,
    currentTimepoint: timepoint,
    isActive: studyWeek !== null,
  })
}

// ── POST /api/config ─────────────────────────────────────────────────────────
// Creates or updates the single study config row
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { studyStartDate, studyName } = body

  if (!studyStartDate) {
    return NextResponse.json({ error: 'studyStartDate is required' }, { status: 400 })
  }

  const existing = await prisma.studyConfig.findFirst()

  const config = existing
    ? await prisma.studyConfig.update({
        where: { id: existing.id },
        data: {
          studyStartDate: new Date(studyStartDate),
          studyName: studyName ?? existing.studyName,
        },
      })
    : await prisma.studyConfig.create({
        data: {
          studyStartDate: new Date(studyStartDate),
          studyName: studyName ?? 'HARMONY',
        },
      })

  const studyWeek = getCurrentStudyWeek(config.studyStartDate)
  const timepoint = studyWeek ? getTimepointForWeek(studyWeek) : null

  return NextResponse.json({
    ...config,
    currentStudyWeek: studyWeek,
    currentTimepoint: timepoint,
    isActive: studyWeek !== null,
  })
}
