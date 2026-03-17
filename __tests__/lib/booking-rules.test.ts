/**
 * Unit tests for meeting booking rules (spec).
 * These mirror the business rules implemented in AddTaskModal and AdminCalendar.
 * CALENDAR_END_HOUR = 17 (meetings must end by 17:00).
 */

import {
  CALENDAR_START_HOUR,
  CALENDAR_END_HOUR,
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
  describe("fitsInDay – meetings must end by 17:00", () => {
    it("allows 30 min meeting ending at 17:00 when start is 16:30", () => {
      expect(fitsInDay("16:30", 30)).toBe(true)
    })

    it("disallows 30 min meeting starting at 17:00", () => {
      expect(fitsInDay("17:00", 30)).toBe(false)
    })

    it("allows 1hr meeting ending at 17:00 when start is 16:00", () => {
      expect(fitsInDay("16:00", 60)).toBe(true)
    })

    it("disallows 1hr meeting starting at 16:30", () => {
      expect(fitsInDay("16:30", 60)).toBe(false)
    })

    it("allows 2hr meeting only when start is 15:00", () => {
      expect(fitsInDay("15:00", 120)).toBe(true)
      expect(fitsInDay("15:30", 120)).toBe(false)
    })

    it("allows 1.5hr meeting only when start is 15:30", () => {
      expect(fitsInDay("15:30", 90)).toBe(true)
      expect(fitsInDay("16:00", 90)).toBe(false)
    })

    it("allows 09:00 with 30 min", () => {
      expect(fitsInDay("09:00", 30)).toBe(true)
    })
  })

  describe("time slot generation bounds", () => {
    it("uses calendar start and end from constants", () => {
      expect(CALENDAR_START_HOUR).toBe(9)
      expect(CALENDAR_END_HOUR).toBe(17)
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
