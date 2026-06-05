import { addDays, addMonths, format, parseISO, startOfMonth } from "date-fns"
import { DAY_SLOTS } from "@/lib/calendar-types"

export const LEGACY_SCHEDULE_EFFECTIVE_FROM = "2000-01-01"

export type ScheduleSlotRecord = {
  id?: string
  day: number
  slots: string
  effectiveFrom?: string
}

export type NormalizedScheduleVersion = {
  id?: string
  day: number
  slots: string[]
  effectiveFrom: string
}

/** First day of the next calendar month (schedule edits take effect then). */
export function getNextScheduleEffectiveFrom(from: Date = new Date()): string {
  return format(startOfMonth(addMonths(from, 1)), "yyyy-MM-dd")
}

function parseSlotsJson(slots: string): string[] {
  try {
    const parsed = JSON.parse(slots)
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : []
  } catch {
    return []
  }
}

export function normalizeScheduleRecords(
  records: ScheduleSlotRecord[],
): NormalizedScheduleVersion[] {
  return records.map((r) => ({
    id: r.id,
    day: r.day,
    slots: parseSlotsJson(r.slots),
    effectiveFrom: r.effectiveFrom ?? LEGACY_SCHEDULE_EFFECTIVE_FROM,
  }))
}

function weekdayForDate(dateStr: string): number {
  return parseISO(dateStr).getDay()
}

function fallbackSlotsForDay(day: number, fallback?: Record<number, string[]>): string[] {
  return (fallback ?? DAY_SLOTS)[day] ?? []
}

/** First calendar date >= onOrAfter that falls on the given weekday (0=Sun … 6=Sat). */
export function dateForWeekdayOnOrAfter(weekday: number, onOrAfter: string): string {
  let d = parseISO(onOrAfter)
  while (d.getDay() !== weekday) {
    d = addDays(d, 1)
  }
  return format(d, "yyyy-MM-dd")
}

/** Slots active on a concrete calendar date (latest version with effectiveFrom <= date). */
export function resolveSlotsForDate(
  dateStr: string,
  records: ScheduleSlotRecord[],
  fallback?: Record<number, string[]>,
): string[] {
  const day = weekdayForDate(dateStr)
  const versions = normalizeScheduleRecords(records).filter(
    (v) => v.day === day && v.effectiveFrom <= dateStr,
  )

  if (versions.length === 0) {
    return fallbackSlotsForDay(day, fallback).slice().sort()
  }

  const latest = versions.reduce((best, v) =>
    v.effectiveFrom > best.effectiveFrom ? v : best,
  )
  return latest.slots.slice().sort()
}

/**
 * Slots shown in the admin editor for a weekday at a given effectiveFrom.
 * Uses the upcoming version if it exists; otherwise inherits from the prior schedule.
 */
export function resolveSlotsForWeekdayAtEffectiveFrom(
  day: number,
  effectiveFrom: string,
  records: ScheduleSlotRecord[],
  fallback?: Record<number, string[]>,
): string[] {
  const exact = normalizeScheduleRecords(records).find(
    (v) => v.day === day && v.effectiveFrom === effectiveFrom,
  )
  if (exact) return exact.slots.slice().sort()

  const anchorDate = dateForWeekdayOnOrAfter(day, effectiveFrom)
  return resolveSlotsForDate(anchorDate, records, fallback)
}

/** Find existing DB record id for (day, effectiveFrom), if any. */
export function findScheduleVersionId(
  day: number,
  effectiveFrom: string,
  records: ScheduleSlotRecord[],
): string | undefined {
  return records.find(
    (r) =>
      r.day === day &&
      (r.effectiveFrom ?? LEGACY_SCHEDULE_EFFECTIVE_FROM) === effectiveFrom,
  )?.id
}
