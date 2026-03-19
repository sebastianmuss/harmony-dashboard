/**
 * HARMONY Study — Database Seed Script
 *
 * Generates realistic demo data:
 *   - 200 patients (100 Feldbach / 100 Vienna) across 5 shifts
 *   - 7 providers + 2 admins
 *   - Study currently in week 8 of 12
 *   - PROM + clinical data for weeks 1–7, partial week 8
 *   - Activity logs (logins, PROM submits, data views)
 *
 * Run:  npm run db:seed
 * NOTE: Wipes all existing data. Do NOT run on production.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createHmac } from 'crypto'
import { subDays, addDays, startOfDay, differenceInCalendarDays, addMinutes, addHours } from 'date-fns'

const prisma = new PrismaClient()

function pinIndexHash(pin: string): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set')
  return createHmac('sha256', secret).update(pin).digest('hex')
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function randFloat(min: number, max: number, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals))
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Gaussian-ish score: biased toward 2-3 */
function biasedScore(): number {
  const r = Math.random()
  if (r < 0.10) return 1
  if (r < 0.35) return 2
  if (r < 0.68) return 3
  if (r < 0.88) return 4
  return 5
}

function getTimepoint(week: number): 'yesterday' | 'arrival' | 'now' {
  const pos = ((week - 1) % 3)
  if (pos === 0) return 'yesterday'
  if (pos === 1) return 'arrival'
  return 'now'
}

function getDialysisDates(schedule: string, customDays: string | null, from: Date, to: Date): Date[] {
  let allowedDays: number[]
  if (schedule === 'MWF') allowedDays = [1, 3, 5]
  else if (schedule === 'TThS') allowedDays = [2, 4, 6]
  else if (schedule === 'custom' && customDays) allowedDays = customDays.split(',').map(Number)
  else allowedDays = [1, 3, 5]

  const dates: Date[] = []
  let cur = new Date(from)
  while (cur <= to) {
    if (allowedDays.includes(cur.getDay())) dates.push(new Date(cur))
    cur = addDays(cur, 1)
  }
  return dates
}

function studyWeekFor(date: Date, studyStart: Date): number | null {
  const diff = differenceInCalendarDays(startOfDay(date), startOfDay(studyStart))
  if (diff < 0) return null
  const week = Math.floor(diff / 7) + 1
  return week > 12 ? null : week
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PROVIDER_FIRST = ['Stefan', 'Andreas', 'Christian', 'Markus', 'Thomas', 'Sabine', 'Barbara', 'Claudia', 'Eva', 'Sandra', 'Julia', 'Michael']
const PROVIDER_LAST  = ['Brandl', 'Kirchner', 'Hollerer', 'Reindl', 'Zangl', 'Pointner', 'Fink', 'Strasser', 'Koller', 'Dober', 'Mayer', 'Huber']

// Shifts 0-2 → Feldbach (MWF), shifts 3-4 → Vienna (TThS)
const SHIFT_CENTERS = ['Feldbach', 'Feldbach', 'Feldbach', 'Vienna', 'Vienna']

// ── Main seed ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seeding HARMONY database…\n')

  // ── Wipe all data ──────────────────────────────────────────────────────────
  console.log('  Clearing existing data…')
  await prisma.activityLog.deleteMany()
  await prisma.promResponse.deleteMany()
  await prisma.clinicalData.deleteMany()
  await prisma.patient.deleteMany()
  await prisma.provider.deleteMany()
  await prisma.shift.deleteMany()
  await prisma.studyConfig.deleteMany()
  console.log('  ✓ Cleared\n')

  // ── Shifts ─────────────────────────────────────────────────────────────────
  console.log('  Creating 5 shifts…')
  const shiftDefs = [
    { name: 'MWF Früh',     schedule: 'MWF',  timeOfDay: 'morning', sortOrder: 1 },
    { name: 'MWF Mittag',   schedule: 'MWF',  timeOfDay: 'noon',    sortOrder: 2 },
    { name: 'MWF Abend',    schedule: 'MWF',  timeOfDay: 'evening', sortOrder: 3 },
    { name: 'DiDoSa Früh',  schedule: 'TThS', timeOfDay: 'morning', sortOrder: 4 },
    { name: 'DiDoSa Mittag',schedule: 'TThS', timeOfDay: 'noon',    sortOrder: 5 },
  ]
  const shifts = await Promise.all(shiftDefs.map((s) => prisma.shift.create({ data: s })))
  console.log(`  ✓ Created ${shifts.length} shifts\n`)

  // ── Study config: currently in week 8 ─────────────────────────────────────
  const today = startOfDay(new Date())
  const studyStartDate = subDays(today, 53) // 53 days ago → today is day 54 → week 8
  const config = await prisma.studyConfig.create({
    data: { studyStartDate, studyName: 'HARMONY' },
  })
  console.log(`  ✓ Study start: ${config.studyStartDate.toISOString().slice(0, 10)} (current week: 8)\n`)

  // ── Providers ──────────────────────────────────────────────────────────────
  console.log('  Creating providers…')
  const ADMIN_PASS = await bcrypt.hash('harmony-admin-2024', 12)
  await prisma.provider.createMany({
    data: [
      { name: 'Dr. Theresa Hollerer', username: 'admin',  passwordHash: ADMIN_PASS, role: 'admin', shiftId: null, center: null },
      { name: 'Dr. Michael Reindl',   username: 'reindl', passwordHash: ADMIN_PASS, role: 'admin', shiftId: null, center: null },
    ],
  })
  const STAFF_PASS = await bcrypt.hash('harmony-staff-2024', 12)
  const usedProviderNames = new Set<string>()
  const providerData = shifts.map((shift, i) => {
    let name: string
    do { name = `${pick(PROVIDER_FIRST)} ${pick(PROVIDER_LAST)}` } while (usedProviderNames.has(name))
    usedProviderNames.add(name)
    return {
      name,
      username: `provider${i + 1}`,
      passwordHash: STAFF_PASS,
      role: 'provider' as const,
      shiftId: shift.id,
      center: SHIFT_CENTERS[i] ?? 'Feldbach',
    }
  })
  await prisma.provider.createMany({ data: providerData })
  const providers = await prisma.provider.findMany({ orderBy: { id: 'asc' } })
  console.log(`  ✓ Created 2 admins + 5 providers\n`)

  // ── Patients: 200 total, 100 per center ───────────────────────────────────
  console.log('  Creating 200 patients (100 Feldbach / 100 Vienna)…')

  const usedPins = new Set<string>()
  function uniquePin(): string {
    let pin: string
    do { pin = String(rand(100000, 999999)) } while (usedPins.has(pin))
    usedPins.add(pin)
    return pin
  }

  let patientCodeCounter = 1
  function nextCode(): string {
    return `HMY-${String(patientCodeCounter++).padStart(4, '0')}`
  }

  // Distribution: Feldbach shifts 0-2 → 34/33/33; Vienna shifts 3-4 → 50/50
  const patientsPerShift = [34, 33, 33, 50, 50]

  // 5 dropout indices (spread across the cohort)
  const dropoutPatientNumbers = new Set([12, 37, 89, 134, 178])

  type CreatedPatient = {
    id: number; shiftId: number; shiftSchedule: string
    center: string; enrollmentDate: Date; droppedOut: boolean; dropoutDate: Date | null
    dryWeight: number
  }
  const createdPatients: CreatedPatient[] = []
  let globalIdx = 0

  for (const [shiftIdx, shift] of shifts.entries()) {
    const center = SHIFT_CENTERS[shiftIdx] ?? 'Feldbach'
    const count = patientsPerShift[shiftIdx]

    for (let i = 0; i < count; i++, globalIdx++) {
      const patientCode = nextCode()
      const rawPin = uniquePin()
      const [pinHash, indexHash] = await Promise.all([
        bcrypt.hash(rawPin, 12),
        Promise.resolve(pinIndexHash(rawPin)),
      ])

      const enrollmentDate = subDays(studyStartDate, rand(0, 14))
      const isDropout = dropoutPatientNumbers.has(globalIdx)
      // Dropout occurs between weeks 3-6
      const dropoutDate = isDropout ? subDays(today, rand(14, 38)) : null
      const dryWeight = randFloat(52, 115, 1)

      const patient = await prisma.patient.create({
        data: {
          patientCode,
          pin: pinHash,
          pinIndexHash: indexHash,
          shiftId: shift.id,
          center,
          dialysisSchedule: shift.schedule,
          enrollmentDate,
          isActive: !isDropout,
          droppedOutAt: dropoutDate,
          dryWeight,
        },
      })

      createdPatients.push({
        id: patient.id,
        shiftId: shift.id,
        shiftSchedule: shift.schedule,
        center,
        enrollmentDate,
        droppedOut: isDropout,
        dropoutDate,
        dryWeight,
      })
    }
  }
  const nDropped = createdPatients.filter((p) => p.droppedOut).length
  console.log(`  ✓ Created ${createdPatients.length} patients (${nDropped} dropped out)\n`)

  // ── PROM + clinical data + patient activity logs ───────────────────────────
  console.log('  Generating PROM responses, clinical data, and activity logs…')

  const yesterday = subDays(today, 1)
  let totalProms = 0, totalClinical = 0
  const activityLogs: {
    eventType: string; actorType: string; actorId: number
    center: string; shiftId: number; createdAt: Date
  }[] = []

  for (const patient of createdPatients) {
    const cutoff = patient.droppedOut && patient.dropoutDate ? patient.dropoutDate : yesterday
    const sessionDates = getDialysisDates(patient.shiftSchedule, null, studyStartDate, cutoff)

    for (const sessionDate of sessionDates) {
      const week = studyWeekFor(sessionDate, studyStartDate)
      if (!week) continue

      // Completion rates: high early, slightly lower in recent weeks
      const rate = patient.droppedOut ? 0.65
        : week <= 3 ? 0.92
        : week <= 6 ? 0.86
        : 0.78  // weeks 7-8

      if (Math.random() > rate) continue

      const timepoint = getTimepoint(week)
      // Submission time: 30–150 min into session
      const submittedAt = addMinutes(sessionDate, rand(30, 150))

      try {
        await prisma.promResponse.create({
          data: {
            patientId: patient.id,
            sessionDate,
            studyWeek: week,
            timepointReference: timepoint,
            fluidStatusScore: biasedScore(),
            thirstScore: biasedScore(),
            fluidOverloadScore: biasedScore(),
            submittedAt,
          },
        })
        totalProms++

        // Login event just before PROM (1–20 min before submit)
        activityLogs.push({
          eventType: 'login',
          actorType: 'patient',
          actorId: patient.id,
          center: patient.center,
          shiftId: patient.shiftId,
          createdAt: addMinutes(sessionDate, rand(15, 110)),
        })
        // Prom submit event
        activityLogs.push({
          eventType: 'prom_submit',
          actorType: 'patient',
          actorId: patient.id,
          center: patient.center,
          shiftId: patient.shiftId,
          createdAt: submittedAt,
        })
      } catch { /* duplicate guard */ }

      // Clinical data: ~75% coverage
      if (Math.random() < 0.75) {
        const baseWeight = patient.dryWeight + randFloat(0.3, 4.5)
        const idwg = randFloat(0.3, 4.5)
        const systolic = rand(105, 185)
        const diastolic = rand(58, 105)
        try {
          await prisma.clinicalData.create({
            data: {
              patientId: patient.id,
              sessionDate,
              preDialysisWeight: baseWeight,
              interdialyticWeightGain: idwg,
              systolicBp: systolic,
              diastolicBp: diastolic,
            },
          })
          totalClinical++
        } catch { /* duplicate guard */ }
      }
    }
  }

  // ── Provider activity logs ─────────────────────────────────────────────────
  // Generate login + data_view events for weeks 1–8 per provider
  const staffProviders = providers.filter((p) => p.role === 'provider')
  const adminProviders  = providers.filter((p) => p.role === 'admin')

  for (const provider of staffProviders) {
    const provCenter = provider.center ?? 'Feldbach'
    const provShift  = shifts.find((s) => s.id === provider.shiftId)
    const workDays   = provShift?.schedule === 'TThS' ? [2, 4, 6] : [1, 3, 5]

    // For each past day in the study (up to yesterday), simulate activity on work days
    for (let daysBack = 53; daysBack >= 1; daysBack--) {
      const day = subDays(today, daysBack)
      if (!workDays.includes(day.getDay())) continue

      const week = studyWeekFor(day, studyStartDate)
      if (!week) continue

      // Login: ~80% of work days
      if (Math.random() < 0.80) {
        activityLogs.push({
          eventType: 'login',
          actorType: 'provider',
          actorId: provider.id,
          center: provCenter,
          shiftId: provider.shiftId ?? 0,
          createdAt: addHours(day, rand(7, 9)), // shift starts 7-9am
        })
      }

      // Data views: 2-5 per work day (refreshes throughout the shift)
      const viewCount = rand(2, 5)
      for (let v = 0; v < viewCount; v++) {
        activityLogs.push({
          eventType: 'data_view',
          actorType: 'provider',
          actorId: provider.id,
          center: provCenter,
          shiftId: provider.shiftId ?? 0,
          createdAt: addMinutes(addHours(day, rand(7, 14)), rand(0, 59)),
        })
      }
    }
  }

  // Admin activity: logins ~3x/week, data views ~2x/week
  for (const admin of adminProviders) {
    for (let daysBack = 53; daysBack >= 1; daysBack--) {
      const day = subDays(today, daysBack)
      // Admins work Mon-Fri
      if (day.getDay() === 0 || day.getDay() === 6) continue
      if (Math.random() < 0.55) {
        activityLogs.push({
          eventType: 'login',
          actorType: 'admin',
          actorId: admin.id,
          center: null as any,
          shiftId: null as any,
          createdAt: addHours(day, rand(8, 10)),
        })
      }
      if (Math.random() < 0.45) {
        activityLogs.push({
          eventType: 'data_view',
          actorType: 'admin',
          actorId: admin.id,
          center: null as any,
          shiftId: null as any,
          createdAt: addMinutes(addHours(day, rand(8, 16)), rand(0, 59)),
        })
      }
    }
  }

  // Bulk insert activity logs in batches
  const BATCH = 500
  for (let i = 0; i < activityLogs.length; i += BATCH) {
    await prisma.activityLog.createMany({ data: activityLogs.slice(i, i + BATCH) })
  }

  console.log(`  ✓ Created ${totalProms} PROM responses`)
  console.log(`  ✓ Created ${totalClinical} clinical data records`)
  console.log(`  ✓ Created ${activityLogs.length} activity log entries\n`)

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════')
  console.log('  SEED COMPLETE')
  console.log('═══════════════════════════════════════')
  console.log('  Admin:    admin / harmony-admin-2024')
  console.log('  Staff:    provider1–5 / harmony-staff-2024')
  console.log('  Patients: 6-digit PIN — set via Admin Panel')
  console.log('  Study:    Week 8 of 12 (started 53 days ago)')
  console.log('═══════════════════════════════════════\n')
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
