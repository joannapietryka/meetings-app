import { LEGACY_SCHEDULE_EFFECTIVE_FROM } from "@/lib/schedule-slots"

export type InCabinetDayRecord = {
  id?: string
  inCabinetWeekdays?: string
  inCabinetWeekday?: number
  effectiveFrom?: string
}

export type NormalizedInCabinetVersion = {
  id?: string
  weekdays: number[]
  effectiveFrom: string
}

/** Default: Wednesday only. */
export const DEFAULT_IN_CABINET_WEEKDAYS: number[] = [3]

function parseWeekdaysJson(weekdays: string): number[] {
  try {
    const parsed = JSON.parse(weekdays)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((d): d is number => typeof d === "number" && d >= 1 && d <= 5)
  } catch {
    return []
  }
}

export function normalizeInCabinetRecords(
  records: InCabinetDayRecord[],
): NormalizedInCabinetVersion[] {
  return records.map((r) => {
    let weekdays: number[] = []
    if (r.inCabinetWeekdays) {
      weekdays = parseWeekdaysJson(r.inCabinetWeekdays)
    } else if (r.inCabinetWeekday != null) {
      weekdays = [r.inCabinetWeekday]
    }
    return {
      id: r.id,
      weekdays,
      effectiveFrom: r.effectiveFrom ?? LEGACY_SCHEDULE_EFFECTIVE_FROM,
    }
  })
}

/** Weekdays with in-cabinet visits active on a concrete calendar date. */
export function resolveInCabinetWeekdaysForDate(
  dateStr: string,
  records: InCabinetDayRecord[],
  fallback: number[] = DEFAULT_IN_CABINET_WEEKDAYS,
): number[] {
  const versions = normalizeInCabinetRecords(records).filter((v) => v.effectiveFrom <= dateStr)

  if (versions.length === 0) {
    return fallback.slice().sort()
  }

  const latest = versions.reduce((best, v) =>
    v.effectiveFrom > best.effectiveFrom ? v : best,
  )
  return latest.weekdays.slice().sort()
}

/**
 * Weekdays shown in the admin editor for a given effectiveFrom.
 * Uses the upcoming version if it exists; otherwise inherits the prior schedule.
 */
export function resolveInCabinetWeekdaysAtEffectiveFrom(
  effectiveFrom: string,
  records: InCabinetDayRecord[],
  fallback: number[] = DEFAULT_IN_CABINET_WEEKDAYS,
): number[] {
  const exact = normalizeInCabinetRecords(records).find(
    (v) => v.effectiveFrom === effectiveFrom,
  )
  if (exact) return exact.weekdays.slice().sort()

  return resolveInCabinetWeekdaysForDate(effectiveFrom, records, fallback)
}

export function findInCabinetDaysVersionId(
  effectiveFrom: string,
  records: InCabinetDayRecord[],
): string | undefined {
  return records.find(
    (r) => (r.effectiveFrom ?? LEGACY_SCHEDULE_EFFECTIVE_FROM) === effectiveFrom,
  )?.id
}
