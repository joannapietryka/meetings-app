import {
  DEFAULT_IN_CABINET_WEEKDAYS,
  findInCabinetDaysVersionId,
  resolveInCabinetWeekdaysAtEffectiveFrom,
  resolveInCabinetWeekdaysForDate,
} from "@/lib/in-cabinet-days"

describe("in-cabinet-days", () => {
  it("defaults to Wednesday when no records exist", () => {
    expect(resolveInCabinetWeekdaysForDate("2026-06-03", [])).toEqual([3])
    expect(DEFAULT_IN_CABINET_WEEKDAYS).toEqual([3])
  })

  it("reads legacy single weekday without effectiveFrom", () => {
    const weekdays = resolveInCabinetWeekdaysForDate("2026-06-03", [
      { id: "1", inCabinetWeekday: 5 },
    ])
    expect(weekdays).toEqual([5])
  })

  it("applies the latest version on or before the date", () => {
    const records = [
      { id: "1", inCabinetWeekdays: "[3]", effectiveFrom: "2026-06-01" },
      { id: "2", inCabinetWeekdays: "[3,5]", effectiveFrom: "2026-07-01" },
    ]
    expect(resolveInCabinetWeekdaysForDate("2026-06-15", records)).toEqual([3])
    expect(resolveInCabinetWeekdaysForDate("2026-07-02", records)).toEqual([3, 5])
  })

  it("inherits prior schedule for upcoming effectiveFrom in admin editor", () => {
    const records = [
      { id: "1", inCabinetWeekdays: "[3]", effectiveFrom: "2026-06-01" },
    ]
    expect(resolveInCabinetWeekdaysAtEffectiveFrom("2026-07-01", records)).toEqual([3])
    expect(
      resolveInCabinetWeekdaysAtEffectiveFrom("2026-07-01", [
        ...records,
        { id: "2", inCabinetWeekdays: "[2,4]", effectiveFrom: "2026-07-01" },
      ]),
    ).toEqual([2, 4])
  })

  it("finds version id by effectiveFrom", () => {
    const records = [
      { id: "a", inCabinetWeekdays: "[3]", effectiveFrom: "2026-07-01" },
    ]
    expect(findInCabinetDaysVersionId("2026-07-01", records)).toBe("a")
    expect(findInCabinetDaysVersionId("2026-08-01", records)).toBeUndefined()
  })
})
