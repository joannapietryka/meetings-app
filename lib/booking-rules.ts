import { addDays, addHours, format, isAfter, isBefore, isWeekend, parse, startOfDay } from "date-fns"
import {
  CALENDAR_END_HOUR,
  SESSION_DURATION,
  type TaskCategory,
} from "@/lib/calendar-types"
import { resolveInCabinetWeekdaysForDate, type InCabinetDayRecord } from "@/lib/in-cabinet-days"
import { resolveSlotsForDate, type ScheduleSlotRecord } from "@/lib/schedule-slots"
import { getCategoryForDate } from "@/lib/visit-category"

export const GUEST_BOOKING_HORIZON_DAYS = 30
export const GUEST_MIN_LEAD_HOURS = 2

export type BookingMeetingRef = {
  id: string
  date: string
  time?: string
  duration?: number
}

export function getWeekKey(dateStr: string): string {
  const date = parse(dateStr, "yyyy-MM-dd", new Date())
  const dow = date.getDay()
  const diffToMonday = dow === 0 ? -6 : 1 - dow
  const monday = addDays(date, diffToMonday)
  return format(monday, "yyyy-MM-dd")
}

export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export function sessionFitsInDay(time: string, durationMinutes = SESSION_DURATION): boolean {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m + durationMinutes <= CALENDAR_END_HOUR * 60
}

export function isDateInGuestBookingWindow(
  day: Date,
  today: Date,
  maxBookingDate: Date,
): boolean {
  const sod = startOfDay(day)
  return !isBefore(sod, today) && !isAfter(sod, maxBookingDate)
}

export function getGuestBookingWindow(now = new Date()) {
  const today = startOfDay(now)
  return {
    today,
    maxBookingDate: addDays(today, GUEST_BOOKING_HORIZON_DAYS),
    minBookingDateTime: addHours(now, GUEST_MIN_LEAD_HOURS),
  }
}

function meetingEndMs(meeting: BookingMeetingRef, now: Date): number {
  const [year, month, day] = meeting.date.split("-").map(Number)
  const [h, min] = (meeting.time ?? "00:00").split(":").map(Number)
  const start = new Date(year, month - 1, day, h, min).getTime()
  return start + (meeting.duration ?? SESSION_DURATION) * 60 * 1000
}

export function isUpcomingBookingMeeting(meeting: BookingMeetingRef, now = new Date()): boolean {
  return meetingEndMs(meeting, now) > now.getTime()
}

export type BookingLimitResult = { ok: true } | { ok: false; code: string; message: string }

export function validateGuestBookingLimits(params: {
  targetDate: string
  existingMeetings: BookingMeetingRef[]
  excludeMeetingId?: string
  previousDate?: string
  now?: Date
}): BookingLimitResult {
  const now = params.now ?? new Date()
  const upcoming = params.existingMeetings.filter(
    (m) => m.id !== params.excludeMeetingId && isUpcomingBookingMeeting(m, now),
  )

  if (params.previousDate !== params.targetDate) {
    const dayCount = upcoming.filter((m) => m.date === params.targetDate).length
    if (dayCount >= 1) {
      return {
        ok: false,
        code: "day_limit",
        message: "Masz już wizytę zaplanowaną na ten dzień.",
      }
    }

    const weekCount = upcoming.filter(
      (m) => getWeekKey(m.date) === getWeekKey(params.targetDate),
    ).length
    if (weekCount >= 1) {
      return {
        ok: false,
        code: "week_limit",
        message: "Możesz zarezerwować maksymalnie 1 wizytę w tygodniu.",
      }
    }

    const monthKey = getMonthKey(params.targetDate)
    const monthCount = upcoming.filter((m) => getMonthKey(m.date) === monthKey).length
    if (monthCount >= 4) {
      return {
        ok: false,
        code: "month_limit",
        message: "Możesz zarezerwować maksymalnie 4 wizyty w miesiącu kalendarzowym.",
      }
    }
  }

  return { ok: true }
}

export function validateGuestSlot(params: {
  date: string
  time: string
  category: TaskCategory
  scheduleSlotRecords: ScheduleSlotRecord[]
  inCabinetDayRecords: InCabinetDayRecord[]
  blockedDates: Set<string>
  blockedSlots: Map<string, Set<string>>
  takenMeetings: Array<{ id: string; date: string; time?: string }>
  excludeMeetingId?: string
  now?: Date
}): BookingLimitResult {
  const now = params.now ?? new Date()
  const { today, maxBookingDate, minBookingDateTime } = getGuestBookingWindow(now)
  const date = parse(params.date, "yyyy-MM-dd", new Date())

  if (isWeekend(date)) {
    return { ok: false, code: "invalid_date", message: "Rezerwacja w weekendy jest niedostępna." }
  }
  if (!isDateInGuestBookingWindow(date, today, maxBookingDate)) {
    return { ok: false, code: "invalid_date", message: "Wybrana data jest poza dozwolonym zakresem." }
  }
  if (params.blockedDates.has(params.date)) {
    return { ok: false, code: "blocked_date", message: "Ten dzień jest niedostępny." }
  }

  const expectedCategory = getCategoryForDate(
    params.date,
    resolveInCabinetWeekdaysForDate(params.date, params.inCabinetDayRecords),
  )
  if (params.category !== expectedCategory) {
    return {
      ok: false,
      code: "invalid_category",
      message: "Typ wizyty nie odpowiada wybranemu dniu.",
    }
  }

  if (!resolveSlotsForDate(params.date, params.scheduleSlotRecords).includes(params.time)) {
    return { ok: false, code: "invalid_slot", message: "Wybrany termin nie jest dostępny." }
  }
  if (!sessionFitsInDay(params.time)) {
    return { ok: false, code: "invalid_slot", message: "Sesja nie mieści się w godzinach pracy." }
  }
  if (params.blockedSlots.get(params.date)?.has(params.time)) {
    return { ok: false, code: "blocked_slot", message: "Ten termin jest zablokowany." }
  }

  const [h, m] = params.time.split(":").map(Number)
  const slotDateTime = new Date(date)
  slotDateTime.setHours(h, m, 0, 0)
  if (isBefore(slotDateTime, minBookingDateTime)) {
    return {
      ok: false,
      code: "lead_time",
      message: "Rezerwacja musi być co najmniej 2 godziny wcześniej.",
    }
  }

  const taken = params.takenMeetings.some(
    (meeting) =>
      meeting.id !== params.excludeMeetingId &&
      meeting.date === params.date &&
      meeting.time === params.time,
  )
  if (taken) {
    return { ok: false, code: "slot_taken", message: "Ten termin został właśnie zarezerwowany." }
  }

  return { ok: true }
}
