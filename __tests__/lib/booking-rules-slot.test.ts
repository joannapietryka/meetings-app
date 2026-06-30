/** @jest-environment node */
import { validateGuestSlot } from "@/lib/booking-rules"
import { DAY_SLOTS } from "@/lib/calendar-types"

describe("validateGuestSlot", () => {
  const scheduleSlotRecords = Object.entries(DAY_SLOTS).flatMap(([day, slots]) => ({
    day: Number(day),
    slots: JSON.stringify(slots),
  }))

  it("rejects weekend dates", () => {
    const result = validateGuestSlot({
      date: "2026-03-21",
      time: "09:00",
      category: "online",
      scheduleSlotRecords,
      inCabinetDayRecords: [],
      blockedDates: new Set(),
      blockedSlots: new Map(),
      takenMeetings: [],
      now: new Date("2026-03-10T10:00:00"),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("invalid_date")
  })

  it("rejects taken slots", () => {
    const result = validateGuestSlot({
      date: "2026-03-17",
      time: "09:00",
      category: "online",
      scheduleSlotRecords,
      inCabinetDayRecords: [],
      blockedDates: new Set(),
      blockedSlots: new Map(),
      takenMeetings: [{ id: "other", date: "2026-03-17", time: "09:00" }],
      now: new Date("2026-03-10T10:00:00"),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("slot_taken")
  })
})
