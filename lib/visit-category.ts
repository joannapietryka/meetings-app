import { parseISO } from "date-fns"
import type { TaskCategory } from "@/lib/calendar-types"
import { DEFAULT_IN_CABINET_WEEKDAYS } from "@/lib/in-cabinet-days"

/** @deprecated Use DEFAULT_IN_CABINET_WEEKDAYS */
export const DEFAULT_IN_CABINET_WEEKDAY = DEFAULT_IN_CABINET_WEEKDAYS[0]

export const WORK_WEEKDAYS: { day: number; label: string }[] = [
  { day: 1, label: "Poniedziałek" },
  { day: 2, label: "Wtorek" },
  { day: 3, label: "Środa" },
  { day: 4, label: "Czwartek" },
  { day: 5, label: "Piątek" },
]

export function getInCabinetWeekdayLabel(day: number): string {
  return WORK_WEEKDAYS.find((w) => w.day === day)?.label ?? "—"
}

export function formatInCabinetWeekdaysLabel(weekdays: number[]): string {
  if (weekdays.length === 0) return "Brak dni w gabinecie"
  return weekdays
    .slice()
    .sort((a, b) => a - b)
    .map(getInCabinetWeekdayLabel)
    .join(", ")
}

export function getCategoryForDate(
  dateStr: string,
  inCabinetWeekdays: number[] = DEFAULT_IN_CABINET_WEEKDAYS,
): TaskCategory {
  return inCabinetWeekdays.includes(parseISO(dateStr).getDay())
    ? "w_gabinecie"
    : "online"
}
