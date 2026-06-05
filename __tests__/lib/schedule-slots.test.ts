import {
  LEGACY_SCHEDULE_EFFECTIVE_FROM,
  dateForWeekdayOnOrAfter,
  findScheduleVersionId,
  getNextScheduleEffectiveFrom,
  normalizeScheduleRecords,
  resolveSlotsForDate,
  resolveSlotsForWeekdayAtEffectiveFrom,
  type ScheduleSlotRecord,
} from "@/lib/schedule-slots"
import { DAY_SLOTS } from "@/lib/calendar-types"

describe("schedule-slots", () => {
  const legacyMonday: ScheduleSlotRecord = {
    id: "legacy-mon",
    day: 1,
    slots: JSON.stringify(["09:00", "10:15"]),
  }

  const juneMonday: ScheduleSlotRecord = {
    id: "june-mon",
    day: 1,
    slots: JSON.stringify(["14:00"]),
    effectiveFrom: "2026-06-01",
  }

  it("defaults missing effectiveFrom to legacy baseline", () => {
    expect(normalizeScheduleRecords([legacyMonday])[0].effectiveFrom).toBe(
      LEGACY_SCHEDULE_EFFECTIVE_FROM,
    )
  })

  it("getNextScheduleEffectiveFrom returns first day of next month", () => {
    expect(getNextScheduleEffectiveFrom(new Date("2026-05-15"))).toBe("2026-06-01")
    expect(getNextScheduleEffectiveFrom(new Date("2026-12-20"))).toBe("2027-01-01")
  })

  it("resolveSlotsForDate uses latest version on or before the date", () => {
    const records = [legacyMonday, juneMonday]

    expect(resolveSlotsForDate("2026-05-25", records)).toEqual(["09:00", "10:15"])
    expect(resolveSlotsForDate("2026-06-01", records)).toEqual(["14:00"])
    expect(resolveSlotsForDate("2026-07-06", records)).toEqual(["14:00"])
  })

  it("resolveSlotsForDate falls back to DAY_SLOTS when no version exists", () => {
    expect(resolveSlotsForDate("2026-03-18", [])).toEqual(
      (DAY_SLOTS[3] ?? []).slice().sort(),
    )
  })

  it("resolveSlotsForWeekdayAtEffectiveFrom returns exact upcoming version when present", () => {
    const records = [legacyMonday, juneMonday]
    expect(resolveSlotsForWeekdayAtEffectiveFrom(1, "2026-06-01", records)).toEqual([
      "14:00",
    ])
  })

  it("resolveSlotsForWeekdayAtEffectiveFrom inherits prior version before first edit", () => {
    expect(resolveSlotsForWeekdayAtEffectiveFrom(1, "2026-06-01", [legacyMonday])).toEqual([
      "09:00",
      "10:15",
    ])
  })

  it("dateForWeekdayOnOrAfter finds first matching weekday", () => {
    expect(dateForWeekdayOnOrAfter(1, "2026-06-01")).toBe("2026-06-01")
    expect(dateForWeekdayOnOrAfter(2, "2026-06-01")).toBe("2026-06-02")
  })

  it("findScheduleVersionId matches day and effectiveFrom", () => {
    const records = [legacyMonday, juneMonday]
    expect(findScheduleVersionId(1, LEGACY_SCHEDULE_EFFECTIVE_FROM, records)).toBe(
      "legacy-mon",
    )
    expect(findScheduleVersionId(1, "2026-06-01", records)).toBe("june-mon")
    expect(findScheduleVersionId(2, "2026-06-01", records)).toBeUndefined()
  })
})
