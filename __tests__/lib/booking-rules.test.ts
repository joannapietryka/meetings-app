/**
 * Unit tests for meeting booking rules (spec).
 * These mirror the business rules implemented in AddTaskModal and AdminCalendar.
 * CALENDAR_START_HOUR = 8, CALENDAR_END_HOUR = 21, SESSION_DURATION = 50.
 */

import {
  CALENDAR_START_HOUR,
  CALENDAR_END_HOUR,
  SESSION_DURATION,
} from "@/lib/calendar-types"

// --- Spec: pure functions matching app behavior (no app code changed) ---

function fitsInDay(time: string, durationMinutes: number, endHour: number = CALENDAR_END_HOUR): boolean {
  const [h, m] = time.split(":").map(Number)
  const startMinutes = h * 60 + m
  const endMinutes = startMinutes + durationMinutes
  const dayEndMinutes = endHour * 60
  return endMinutes <= dayEndMinutes
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function doIntervalsOverlap(
  startA: number,
  durationA: number,
  startB: number,
  durationB: number
): boolean {
  const endA = startA + durationA
  const endB = startB + durationB
  return startA < endB && startB < endA
}

describe("Booking rules (spec)", () => {
  describe("fitsInDay – sessions must end by 21:00", () => {
    it("allows 50-min session starting at 19:15 (ends at 20:05)", () => {
      expect(fitsInDay("19:15", SESSION_DURATION)).toBe(true)
    })

    it("allows last possible 50-min slot starting at 20:10 (ends at 21:00)", () => {
      expect(fitsInDay("20:10", SESSION_DURATION)).toBe(true)
    })

    it("disallows 50-min session starting at 20:11 (ends at 21:01)", () => {
      expect(fitsInDay("20:11", SESSION_DURATION)).toBe(false)
    })

    it("disallows 50-min session starting at 21:00", () => {
      expect(fitsInDay("21:00", SESSION_DURATION)).toBe(false)
    })

    it("allows 08:00 with 50-min session", () => {
      expect(fitsInDay("08:00", SESSION_DURATION)).toBe(true)
    })

    it("SESSION_DURATION is 50 minutes", () => {
      expect(SESSION_DURATION).toBe(50)
    })
  })

  describe("time slot generation bounds", () => {
    it("uses calendar start and end from constants", () => {
      expect(CALENDAR_START_HOUR).toBe(8)
      expect(CALENDAR_END_HOUR).toBe(21)
    })
  })

  describe("conflict detection – intervals overlap", () => {
    it("same start and duration overlaps with itself", () => {
      const start = timeToMinutes("10:00")
      expect(doIntervalsOverlap(start, 30, start, 30)).toBe(true)
    })

    it("back-to-back meetings do not overlap", () => {
      const start1 = timeToMinutes("10:00")
      const start2 = timeToMinutes("10:30")
      expect(doIntervalsOverlap(start1, 30, start2, 30)).toBe(false)
    })

    it("overlapping 1hr and 30min overlap", () => {
      const start1 = timeToMinutes("10:00")
      const start2 = timeToMinutes("10:15") // not a slot but for overlap math
      expect(doIntervalsOverlap(start1, 60, start2, 30)).toBe(true)
    })

    it("10:00 1hr and 10:30 30min overlap", () => {
      expect(doIntervalsOverlap(timeToMinutes("10:00"), 60, timeToMinutes("10:30"), 30)).toBe(true)
    })

    it("10:00 30min and 10:30 30min do not overlap", () => {
      expect(doIntervalsOverlap(timeToMinutes("10:00"), 30, timeToMinutes("10:30"), 30)).toBe(false)
    })
  })
})
