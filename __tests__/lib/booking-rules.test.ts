import {
  getWeekKey,
  getMonthKey,
  sessionFitsInDay,
  validateGuestBookingLimits,
  GUEST_BOOKING_HORIZON_DAYS,
} from "@/lib/booking-rules"
import { SESSION_DURATION, CALENDAR_END_HOUR } from "@/lib/calendar-types"

describe("booking-rules", () => {
  describe("sessionFitsInDay", () => {
    it("allows 50-min session ending at calendar end", () => {
      expect(sessionFitsInDay("20:10", SESSION_DURATION)).toBe(true)
    })

    it("disallows session ending after calendar end", () => {
      expect(sessionFitsInDay("20:11", SESSION_DURATION)).toBe(false)
    })

    it("uses calendar end hour constant", () => {
      expect(CALENDAR_END_HOUR).toBe(21)
    })
  })

  describe("getWeekKey / getMonthKey", () => {
    it("returns Monday for mid-week date", () => {
      expect(getWeekKey("2026-03-18")).toBe("2026-03-16")
    })

    it("returns YYYY-MM month key", () => {
      expect(getMonthKey("2026-03-18")).toBe("2026-03")
    })
  })

  describe("validateGuestBookingLimits", () => {
    const now = new Date("2026-03-10T10:00:00")

    it("blocks second visit on same day", () => {
      const result = validateGuestBookingLimits({
        targetDate: "2026-03-20",
        existingMeetings: [{ id: "m1", date: "2026-03-20", time: "09:00" }],
        now,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe("day_limit")
    })

    it("blocks second visit in same week on different day", () => {
      const result = validateGuestBookingLimits({
        targetDate: "2026-03-19",
        existingMeetings: [{ id: "m1", date: "2026-03-17", time: "09:00" }],
        now,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe("week_limit")
    })

    it("allows edit on same day without re-checking day limit", () => {
      const result = validateGuestBookingLimits({
        targetDate: "2026-03-17",
        previousDate: "2026-03-17",
        excludeMeetingId: "m1",
        existingMeetings: [{ id: "m1", date: "2026-03-17", time: "09:00" }],
        now,
      })
      expect(result.ok).toBe(true)
    })
  })

  it("exposes guest booking horizon", () => {
    expect(GUEST_BOOKING_HORIZON_DAYS).toBe(30)
  })
})
