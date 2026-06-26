import {
  formatInCabinetWeekdaysLabel,
  getAdminCategoryForDate,
  getCategoryForDate,
  getInCabinetWeekdayLabel,
  isSaturdayDate,
} from "@/lib/visit-category"
import { DEFAULT_IN_CABINET_WEEKDAYS } from "@/lib/in-cabinet-days"

describe("visit-category", () => {
  it("defaults in-cabinet weekdays to Wednesday", () => {
    expect(DEFAULT_IN_CABINET_WEEKDAYS).toEqual([3])
  })

  it("returns w_gabinecie on configured weekdays", () => {
    expect(getCategoryForDate("2026-06-03", [3])).toBe("w_gabinecie")
    expect(getCategoryForDate("2026-06-05", [3, 5])).toBe("w_gabinecie")
  })

  it("returns online on other weekdays", () => {
    expect(getCategoryForDate("2026-06-04", [3])).toBe("online")
    expect(getCategoryForDate("2026-06-02", [3])).toBe("online")
    expect(getCategoryForDate("2026-06-03", [5])).toBe("online")
  })

  it("formats weekday labels", () => {
    expect(getInCabinetWeekdayLabel(3)).toBe("Środa")
    expect(getInCabinetWeekdayLabel(99)).toBe("—")
    expect(formatInCabinetWeekdaysLabel([3, 5])).toBe("Środa, Piątek")
    expect(formatInCabinetWeekdaysLabel([])).toBe("Brak dni w gabinecie")
  })

  it("detects Saturday dates", () => {
    expect(isSaturdayDate("2026-06-06")).toBe(true)
    expect(isSaturdayDate("2026-06-05")).toBe(false)
  })

  it("returns online for admin Saturday visits", () => {
    expect(getAdminCategoryForDate("2026-06-06", [3])).toBe("online")
    expect(getAdminCategoryForDate("2026-06-03", [3])).toBe("w_gabinecie")
  })
})
