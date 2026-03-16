import { differenceInCalendarDays, startOfDay } from 'date-fns'

export type TimepointReference = 'yesterday' | 'arrival' | 'now'

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
 */
export function getTimepointLabel(timepoint: TimepointReference): string {
  switch (timepoint) {
    case 'yesterday':
      return 'Wie war es gestern?' // "How was it yesterday?"
    case 'arrival':
      return 'Wie war es bei Ihrer Ankunft in der Klinik?' // "How was it when you arrived?"
    case 'now':
      return 'Wie ist es gerade jetzt?' // "How is it right now?"
  }
}

/**
 * English variant (for provider/admin UI).
 */
export function getTimepointLabelEn(timepoint: TimepointReference): string {
  switch (timepoint) {
    case 'yesterday':
      return 'How was it yesterday? (non-dialysis day)'
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
