import { addMonths, format, isAfter, isBefore, parseISO, startOfDay } from "date-fns"

export type CalendarViewRange = {
  today: Date
  maxBookingDate: Date
  todayStr: string
  maxBookingDateStr: string
}

/** Bookable admin calendar window: today through one month ahead. */
export function getCalendarViewRange(now: Date = new Date()): CalendarViewRange {
  const today = startOfDay(now)
  const maxBookingDate = addMonths(today, 1)
  return {
    today,
    maxBookingDate,
    todayStr: format(today, "yyyy-MM-dd"),
    maxBookingDateStr: format(maxBookingDate, "yyyy-MM-dd"),
  }
}

export function isDateInCalendarViewRange(
  dateStr: string,
  range: CalendarViewRange = getCalendarViewRange(),
): boolean {
  const day = startOfDay(parseISO(dateStr))
  return !isBefore(day, range.today) && !isAfter(day, range.maxBookingDate)
}
