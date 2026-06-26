import {
  conflictsWithExistingSlots,
  getScheduleSlotError,
  slotFitsInCalendar,
} from "@/lib/slot-conflicts"

describe("slot-conflicts", () => {
  it("detects overlap between 10:15 and 10:30 (50-min sessions)", () => {
    expect(conflictsWithExistingSlots("10:30", ["10:15"])).toBe(true)
    expect(conflictsWithExistingSlots("10:15", ["10:30"])).toBe(true)
  })

  it("allows back-to-back slots with exactly 50 minutes between starts", () => {
    expect(conflictsWithExistingSlots("10:50", ["10:00"])).toBe(false)
    expect(conflictsWithExistingSlots("11:05", ["10:15"])).toBe(false)
  })

  it("rejects duplicate start times", () => {
    expect(getScheduleSlotError("10:15", ["10:15"])).toMatch(/już istnieje/i)
  })

  it("rejects slots that do not fit in the calendar day", () => {
    expect(slotFitsInCalendar("20:11")).toBe(false)
    expect(getScheduleSlotError("20:11", [])).toMatch(/godzinach pracy/i)
  })

  it("returns conflict message for overlapping slots", () => {
    expect(getScheduleSlotError("10:30", ["10:15"])).toMatch(/koliduje/i)
  })

  it("returns null for a valid new slot", () => {
    expect(getScheduleSlotError("12:00", ["10:15", "10:30"])).toBeNull()
  })
})
