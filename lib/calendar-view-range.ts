import { addMonths, format, isAfter, isBefore, parseISO, startOfDay } from "date-fns"

export type CalendarViewRange = {
  today: Date
  maxBookingDate: Date
  todayStr: string
  maxBookingDateStr: string
}

/** How far ahead the admin calendar can be viewed and booked. */
export const ADMIN_CALENDAR_HORIZON_MONTHS = 6

/** Bookable admin calendar window: today through six months ahead. */
export function getCalendarViewRange(now: Date = new Date()): CalendarViewRange {
  const today = startOfDay(now)
  const maxBookingDate = addMonths(today, ADMIN_CALENDAR_HORIZON_MONTHS)
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
