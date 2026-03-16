/**
 * Boxplot statistics helpers (Tukey style: whiskers = 1.5 × IQR).
 */

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo)
}

export interface BoxplotStats {
  whiskerLow: number
  q1: number
  median: number
  q3: number
  whiskerHigh: number
  range: number  // = whiskerHigh - whiskerLow (always ≥ 1 for rendering)
  n: number
}

export function computeBoxplot(values: number[]): BoxplotStats | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = percentile(sorted, 25)
  const median = percentile(sorted, 50)
  const q3 = percentile(sorted, 75)
  const iqr = q3 - q1
  const whiskerLow  = Math.max(sorted[0], q1 - 1.5 * iqr)
  const whiskerHigh = Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr)
  return {
    whiskerLow,
    q1,
    median,
    q3,
    whiskerHigh,
    range: Math.max(whiskerHigh - whiskerLow, 1), // ensure non-zero height
    n: values.length,
  }
}

/**
 * Group an array of {date, value} entries by study week.
 * studyStartDate: ISO date string
 * Returns a sorted array of { week, values }.
 */
export function groupByStudyWeek(
  entries: { date: string; value: number }[],
  studyStartDate: string,
): { week: number; values: number[] }[] {
  const start = new Date(studyStartDate).getTime()
  const groups = new Map<number, number[]>()
  for (const { date, value } of entries) {
    const diffDays = Math.floor((new Date(date).getTime() - start) / 86400000)
    const week = Math.floor(diffDays / 7) + 1
    if (week < 1 || week > 12) continue
    if (!groups.has(week)) groups.set(week, [])
    groups.get(week)!.push(value)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, values]) => ({ week, values }))
}

/**
 * Group by relative week (first session = week 1), for patient view where
 * study start date is not available.
 */
export function groupByRelativeWeek(
  entries: { date: string; value: number }[],
): { week: number; values: number[] }[] {
  if (!entries.length) return []
  const dates = entries.map((e) => new Date(e.date).getTime())
  const firstMs = Math.min(...dates)
  const groups = new Map<number, number[]>()
  for (const { date, value } of entries) {
    const week = Math.floor((new Date(date).getTime() - firstMs) / (7 * 86400000)) + 1
    if (!groups.has(week)) groups.set(week, [])
    groups.get(week)!.push(value)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, values]) => ({ week, values }))
}
