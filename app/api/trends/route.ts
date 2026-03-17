import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// ── GET /api/trends?center= ───────────────────────────────────────────────────
// Weekly PROM + clinical averages. Accessible by providers and admins.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !['provider', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Providers are restricted to their own center; admins can pick any
  const center = session.user.role === 'admin'
    ? (new URL(req.url).searchParams.get('center') || null)
    : (session.user.center ?? null)

  const patientFilter = center ? { patient: { center } } : {}

  // ── PROM trends: mean per study week ───────────────────────────────────────
  const promRows = await prisma.promResponse.findMany({
    where: patientFilter,
    select: {
      studyWeek: true,
      fluidStatusScore: true,
      thirstScore: true,
      fluidOverloadScore: true,
    },
    orderBy: { studyWeek: 'asc' },
  })

  const promByWeek: Record<number, { fluid: number[]; thirst: number[]; overload: number[] }> = {}
  for (const r of promRows) {
    if (!promByWeek[r.studyWeek]) promByWeek[r.studyWeek] = { fluid: [], thirst: [], overload: [] }
    promByWeek[r.studyWeek].fluid.push(r.fluidStatusScore)
    promByWeek[r.studyWeek].thirst.push(r.thirstScore)
    promByWeek[r.studyWeek].overload.push(r.fluidOverloadScore)
  }

  function mean(arr: number[]): number | null {
    if (!arr.length) return null
    return parseFloat((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2))
  }

  const promTrends = Array.from({ length: 12 }, (_, i) => {
    const week = i + 1
    const d = promByWeek[week]
    return {
      week,
      fluidStatus: d ? mean(d.fluid) : null,
      thirst: d ? mean(d.thirst) : null,
      overload: d ? mean(d.overload) : null,
      n: d ? d.fluid.length : 0,
    }
  })

  // ── Clinical trends: mean per study week ───────────────────────────────────
  // Link clinical data to study weeks via PROM session dates (same date = same week)
  const clinicalRows = await prisma.clinicalData.findMany({
    where: patientFilter,
    select: {
      sessionDate: true,
      preDialysisWeight: true,
      interdialyticWeightGain: true,
      systolicBp: true,
      diastolicBp: true,
      patientId: true,
    },
  })

  // Get study config for week calculation
  const config = await prisma.studyConfig.findFirst()

  function weekFor(date: Date): number | null {
    if (!config) return null
    const diff = Math.floor(
      (date.getTime() - config.studyStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    )
    const week = diff + 1
    return week >= 1 && week <= 12 ? week : null
  }

  const clinByWeek: Record<number, { weight: number[]; idwg: number[]; sbp: number[]; dbp: number[] }> = {}
  for (const r of clinicalRows) {
    const week = weekFor(new Date(r.sessionDate))
    if (!week) continue
    if (!clinByWeek[week]) clinByWeek[week] = { weight: [], idwg: [], sbp: [], dbp: [] }
    if (r.preDialysisWeight !== null) clinByWeek[week].weight.push(Number(r.preDialysisWeight))
    if (r.interdialyticWeightGain !== null) clinByWeek[week].idwg.push(Number(r.interdialyticWeightGain))
    if (r.systolicBp !== null) clinByWeek[week].sbp.push(r.systolicBp)
    if (r.diastolicBp !== null) clinByWeek[week].dbp.push(r.diastolicBp)
  }

  const clinicalTrends = Array.from({ length: 12 }, (_, i) => {
    const week = i + 1
    const d = clinByWeek[week]
    return {
      week,
      preWeight: d ? mean(d.weight) : null,
      idwg: d ? mean(d.idwg) : null,
      systolic: d ? mean(d.sbp) : null,
      diastolic: d ? mean(d.dbp) : null,
      n: d ? d.weight.length : 0,
    }
  })

  return NextResponse.json({ promTrends, clinicalTrends, center })
}
