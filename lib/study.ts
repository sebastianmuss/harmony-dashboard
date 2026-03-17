import { differenceInCalendarDays, startOfDay } from 'date-fns'

export type TimepointReference = 'yesterday' | 'arrival' | 'now'

/** Dialysis schedule type */
export type DialysisSchedule = 'MWF' | 'TThS' | 'custom'

/** Weekday numbers for preset schedules (0=Sun, 1=Mon, …, 6=Sat) */
const SCHEDULE_DAYS: Record<string, number[]> = {
  MWF:  [1, 3, 5], // Mon, Wed, Fri
  TThS: [2, 4, 6], // Tue, Thu, Sat
}

/**
 * Returns the dialysis day numbers for a patient's schedule.
 * For 'custom', parses the comma-separated customDays string.
 */
export function getScheduleDays(schedule: string, customDays?: string | null): number[] {
  if (schedule === 'custom' && customDays) {
    return customDays.split(',').map(Number).filter((n) => n >= 0 && n <= 6)
  }
  return SCHEDULE_DAYS[schedule] ?? SCHEDULE_DAYS.MWF
}

/**
 * Returns true if the given date is a dialysis day for the patient's schedule.
 */
export function isDialysisDay(date: Date, schedule: string, customDays?: string | null): boolean {
  const days = getScheduleDays(schedule, customDays)
  return days.includes(date.getDay())
}

/**
 * Calculate which study week we are in (1–12).
 * Returns null if the study has not started yet or has ended (> 12 weeks).
 */
export function getCurrentStudyWeek(studyStartDate: Date, referenceDate?: Date): number | null {
  const today = startOfDay(referenceDate ?? new Date())
  const start = startOfDay(studyStartDate)
  const daysDiff = differenceInCalendarDays(today, start)

  if (daysDiff < 0) return null // Study hasn't started

  const weekNumber = Math.floor(daysDiff / 7) + 1
  if (weekNumber > 12) return null // Study has ended

  return weekNumber
}

/**
 * Determine the timepoint reference for a given study week.
 * The 3-week cycle: Week A (1,4,7,10) = yesterday, B (2,5,8,11) = arrival, C (3,6,9,12) = now
 */
export function getTimepointForWeek(studyWeek: number): TimepointReference {
  const position = ((studyWeek - 1) % 3)
  if (position === 0) return 'yesterday'
  if (position === 1) return 'arrival'
  return 'now'
}

/**
 * Human-readable question prompt for each timepoint reference.
 * For 'yesterday' timepoint: if today is a dialysis day → "gestern", if not → "heute"
 * (on non-HD days the patient IS on the reference day itself).
 */
export function getTimepointLabel(timepoint: TimepointReference, onDialysisDay = true): string {
  switch (timepoint) {
    case 'yesterday':
      return onDialysisDay
        ? 'Wie war es gestern?' // HD day: reference = yesterday (off-HD day)
        : 'Wie ist es heute?'   // Off-HD day: reference = today
    case 'arrival':
      return 'Wie war es bei Ihrer Ankunft in der Klinik?'
    case 'now':
      return 'Wie ist es gerade jetzt?'
  }
}

/**
 * English variant (for provider/admin UI).
 */
export function getTimepointLabelEn(timepoint: TimepointReference, onDialysisDay = true): string {
  switch (timepoint) {
    case 'yesterday':
      return onDialysisDay
        ? 'How was it yesterday? (non-dialysis day)'
        : 'How is it today? (non-dialysis day)'
    case 'arrival':
      return 'How was it when you arrived at the clinic today?'
    case 'now':
      return 'How is it right now?'
  }
}

/**
 * Determine whether a dialysis session is a "long gap" session.
 * MWF: Monday is the long-gap session (after weekend).
 * TThS: Tuesday is the long-gap session (after Sunday + Monday).
 */
export function isLongGapSession(sessionDate: Date, schedule: string): boolean {
  const day = sessionDate.getDay() // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  if (schedule === 'MWF') return day === 1 // Monday
  if (schedule === 'TThS') return day === 2 // Tuesday
  return false
}

/**
 * Returns a short description of the long-gap status.
 */
export function getGapLabel(sessionDate: Date, schedule: string): string {
  return isLongGapSession(sessionDate, schedule) ? 'Long gap' : 'Short gap'
}
