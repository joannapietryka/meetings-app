import {
  getCalendarViewRange,
  isDateInCalendarViewRange,
} from "@/lib/calendar-view-range"

describe("calendar-view-range", () => {
  const range = getCalendarViewRange(new Date("2026-06-25T12:00:00"))

  it("spans today through one month ahead", () => {
    expect(range.todayStr).toBe("2026-06-25")
    expect(range.maxBookingDateStr).toBe("2026-07-25")
  })

  it("includes dates inside the admin calendar window", () => {
    expect(isDateInCalendarViewRange("2026-06-25", range)).toBe(true)
    expect(isDateInCalendarViewRange("2026-07-25", range)).toBe(true)
  })

  it("excludes past and far-future dates", () => {
    expect(isDateInCalendarViewRange("2026-06-24", range)).toBe(false)
    expect(isDateInCalendarViewRange("2026-07-26", range)).toBe(false)
  })
})
