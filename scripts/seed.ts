/**
 * HARMONY Study — Database Seed Script
 *
 * Generates realistic demo data for 120 patients across 5 shifts,
 * 5 providers (one per shift) + 2 admins.
 *
 * Run:  npm run db:seed
 *
 * NOTE: This wipes all existing data. Do NOT run on production without a backup.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createHmac } from 'crypto'
import { subDays, addDays, startOfDay, differenceInCalendarDays } from 'date-fns'

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

/** Gaussian-ish score: biased toward 2-3, less often 1 or 4-5 */
function biasedScore(): number {
  const r = Math.random()
  if (r < 0.12) return 1
  if (r < 0.38) return 2
  if (r < 0.70) return 3
  if (r < 0.90) return 4
  return 5
}

/** Get timepoint for study week (weeks 1,4,7,10 → yesterday; 2,5,8,11 → arrival; 3,6,9,12 → now) */
function getTimepoint(week: number): 'yesterday' | 'arrival' | 'now' {
  const pos = ((week - 1) % 3)
  if (pos === 0) return 'yesterday'
  if (pos === 1) return 'arrival'
  return 'now'
}

/**
 * Get dialysis session dates for a patient between two dates.
 * MWF: Mon/Wed/Fri; TThS: Tue/Thu/Sat
 */
function getDialysisDates(schedule: string, from: Date, to: Date): Date[] {
  const mwfDays = [1, 3, 5]    // Mon, Wed, Fri
  const tthsDays = [2, 4, 6]   // Tue, Thu, Sat
  const allowedDays = schedule === 'MWF' ? mwfDays : tthsDays
  const dates: Date[] = []
  let current = new Date(from)
  while (current <= to) {
    if (allowedDays.includes(current.getDay())) {
      dates.push(new Date(current))
    }
    current = addDays(current, 1)
  }
  return dates
}

/** Get study week (1-12) for a given date, given study start date. */
function studyWeekFor(date: Date, studyStart: Date): number | null {
  const diff = differenceInCalendarDays(startOfDay(date), startOfDay(studyStart))
  if (diff < 0) return null
  const week = Math.floor(diff / 7) + 1
  return week > 12 ? null : week
}

const PROVIDER_FIRST = ['Stefan', 'Andreas', 'Christian', 'Markus', 'Thomas', 'Sabine', 'Barbara', 'Claudia', 'Eva', 'Sandra']
const PROVIDER_LAST = ['Brandl', 'Kirchner', 'Hollerer', 'Reindl', 'Zangl', 'Pointner', 'Fink', 'Strasser', 'Koller', 'Dober']

// Centers: first 3 shifts → Feldbach, last 2 → Vienna
const SHIFT_CENTERS = ['Feldbach', 'Feldbach', 'Feldbach', 'Vienna', 'Vienna']

// ── Main seed ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seeding HARMONY database…\n')

  // ── Wipe all data in dependency order ──────────────────────────────────────
  console.log('  Clearing existing data…')
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
    { name: 'MWF Morning',  schedule: 'MWF',  timeOfDay: 'morning', sortOrder: 1 },
    { name: 'MWF Noon',     schedule: 'MWF',  timeOfDay: 'noon',    sortOrder: 2 },
    { name: 'MWF Evening',  schedule: 'MWF',  timeOfDay: 'evening', sortOrder: 3 },
    { name: 'TThS Morning', schedule: 'TThS', timeOfDay: 'morning', sortOrder: 4 },
    { name: 'TThS Noon',    schedule: 'TThS', timeOfDay: 'noon',    sortOrder: 5 },
  ]
  const shifts = await Promise.all(shiftDefs.map((s) => prisma.shift.create({ data: s })))
  console.log(`  ✓ Created ${shifts.length} shifts\n`)

  // ── Study config — started 6 weeks ago (currently in week 7) ──────────────
  const studyStartDate = subDays(new Date(), 42) // 6 weeks ago → now in week 7
  startOfDay(studyStartDate)
  const config = await prisma.studyConfig.create({
    data: { studyStartDate, studyName: 'HARMONY' },
  })
  console.log(`  ✓ Study start date: ${config.studyStartDate.toISOString().slice(0, 10)} (current week: 7)\n`)

  // ── Providers ──────────────────────────────────────────────────────────────
  console.log('  Creating providers…')
  // 2 admins (no center — admins see all)
  const ADMIN_PASS = await bcrypt.hash('harmony-admin-2024', 12)
  await prisma.provider.createMany({
    data: [
      { name: 'Dr. Theresa Hollerer', username: 'admin',  passwordHash: ADMIN_PASS, role: 'admin', shiftId: null, center: null },
      { name: 'Dr. Michael Reindl',   username: 'reindl', passwordHash: ADMIN_PASS, role: 'admin', shiftId: null, center: null },
    ],
  })
  // 1 provider per shift — password: harmony-staff-2024
  const STAFF_PASS = await bcrypt.hash('harmony-staff-2024', 12)
  const providerData = shifts.map((shift, i) => ({
    name: `${pick(PROVIDER_FIRST)} ${pick(PROVIDER_LAST)}`,
    username: `provider${i + 1}`,
    passwordHash: STAFF_PASS,
    role: 'provider' as const,
    shiftId: shift.id,
    center: SHIFT_CENTERS[i] ?? 'Feldbach',
  }))
  await prisma.provider.createMany({ data: providerData })
  console.log(`  ✓ Created 2 admins + 5 providers\n`)

  // ── Patients — 120 total, ~24 per shift ────────────────────────────────────
  console.log('  Creating 120 patients…')
  const usedPins = new Set<string>()
  function uniquePin(): string {
    let pin: string
    do {
      pin = String(rand(100000, 999999)) // exactly 6 digits
    } while (usedPins.has(pin))
    usedPins.add(pin)
    return pin
  }

  // Sequential patient codes: HMY-0001, HMY-0002, …
  let patientCodeCounter = 1
  function nextPatientCode(): string {
    return `HMY-${String(patientCodeCounter++).padStart(4, '0')}`
  }

  // 2 patients will be dropped out (early dropout simulation)
  const TOTAL_PATIENTS = 120
  const PER_SHIFT = TOTAL_PATIENTS / shifts.length // 24 each

  const createdPatients: { id: number; shiftId: number; shiftSchedule: string; enrollmentDate: Date; droppedOut: boolean }[] = []

  for (const [shiftIdx, shift] of shifts.entries()) {
    const center = SHIFT_CENTERS[shiftIdx] ?? 'Feldbach'
    const patientsInShift = PER_SHIFT
    for (let i = 0; i < patientsInShift; i++) {
      const patientCode = nextPatientCode()
      const rawPin = uniquePin()
      const [pinHash, indexHash] = await Promise.all([
        bcrypt.hash(rawPin, 10),
        Promise.resolve(pinIndexHash(rawPin)),
      ])

      // Enrollment: all enrolled at or before study start
      const enrollmentDate = subDays(studyStartDate, rand(0, 30))

      // ~1.7% dropout rate (2 of 120 patients)
      const isDropout = createdPatients.filter((p) => !p.droppedOut).length >= 118 && createdPatients.length < 120
      const droppedOutAt = isDropout ? subDays(new Date(), rand(7, 35)) : null

      const patient = await prisma.patient.create({
        data: {
          patientCode,
          pin: pinHash,
          pinIndexHash: indexHash,
          shiftId: shift.id,
          center,
          dialysisSchedule: shift.schedule, // use shift schedule as default
          enrollmentDate,
          isActive: !isDropout,
          droppedOutAt,
        },
      })

      createdPatients.push({
        id: patient.id,
        shiftId: shift.id,
        shiftSchedule: shift.schedule,
        enrollmentDate,
        droppedOut: isDropout,
      })
    }
  }
  console.log(`  ✓ Created ${createdPatients.length} patients (${createdPatients.filter(p => p.droppedOut).length} dropped out)\n`)

  // ── PROM responses + Clinical data ─────────────────────────────────────────
  console.log('  Generating PROM responses and clinical data for weeks 1–6…')
  // Study has been running 6 full weeks + current partial week 7
  // We'll generate data for weeks 1-6 with realistic completion rates

  const today = startOfDay(new Date())
  let totalPromCreated = 0
  let totalClinicalCreated = 0

  for (const patient of createdPatients) {
    // Get all dialysis dates since study start (up to yesterday for weeks 1-6)
    const studyEnd = subDays(today, 1)
    const sessionDates = getDialysisDates(patient.shiftSchedule, studyStartDate, studyEnd)

    for (const sessionDate of sessionDates) {
      const week = studyWeekFor(sessionDate, studyStartDate)
      if (!week) continue

      // Completion rate: ~85% overall, slightly lower in week 6 (recency)
      const completionRate = patient.droppedOut
        ? (sessionDate < (patient.enrollmentDate) ? 0 : 0.7)
        : week <= 4 ? 0.88 : week <= 6 ? 0.82 : 0.75

      if (Math.random() > completionRate) continue

      const timepoint = getTimepoint(week)

      // Create PROM response
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
            submittedAt: new Date(sessionDate.getTime() + rand(30, 150) * 60 * 1000), // 30-150 min into session
          },
        })
        totalPromCreated++
      } catch {
        // Skip duplicates (shouldn't happen but just in case)
      }

      // Clinical data with ~70% coverage
      if (Math.random() < 0.70) {
        // Simulate realistic clinical values
        const baseWeight = randFloat(55, 110)
        const idwg = randFloat(0.5, 4.5)
        const systolic = rand(110, 175)
        const diastolic = rand(60, 100)

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
          totalClinicalCreated++
        } catch {
          // Skip duplicates
        }
      }
    }
  }

  console.log(`  ✓ Created ${totalPromCreated} PROM responses`)
  console.log(`  ✓ Created ${totalClinicalCreated} clinical data records\n`)

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════')
  console.log('  SEED COMPLETE')
  console.log('═══════════════════════════════════════')
  console.log('  Admin login:    admin / harmony-admin-2024')
  console.log('  Provider login: provider1–5 / harmony-staff-2024')
  console.log('  Patient login:  4-digit PIN (assigned during creation)')
  console.log('')
  console.log('  To find a patient PIN, use Prisma Studio:')
  console.log('    npm run db:studio')
  console.log('  Note: PINs are bcrypt-hashed — you can set known PINs')
  console.log('    via the Admin Panel after seeding.')
  console.log('═══════════════════════════════════════\n')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
