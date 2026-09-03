export const REMINDER_TIME_ZONE = "Europe/Warsaw"
export const REMINDER_DAYS_BEFORE = 2

export type ReminderMeeting = {
  id: string
  title?: string
  description?: string
  category?: string
  date?: string
  time?: string
  duration?: number
  userEmail?: string | null
  userPhone?: string | null
  remindedAt?: string | null
}

/** Calendar date `YYYY-MM-DD` in the given IANA time zone. */
export function formatDateInTimeZone(date: Date, timeZone: string = REMINDER_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/** Add whole calendar days to an ISO date string without local TZ drift. */
export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return utc.toISOString().slice(0, 10)
}

/** Visit date that should receive a reminder today (today + N days in Warsaw). */
export function getReminderTargetDate(
  now: Date = new Date(),
  daysBefore: number = REMINDER_DAYS_BEFORE,
  timeZone: string = REMINDER_TIME_ZONE,
): string {
  const today = formatDateInTimeZone(now, timeZone)
  return addCalendarDays(today, daysBefore)
}

export function isMeetingDueForReminder(
  meeting: ReminderMeeting,
  targetDate: string,
): meeting is ReminderMeeting & {
  id: string
  title: string
  category: "online" | "w_gabinecie"
  date: string
  userEmail: string
} {
  if (!meeting.id || !meeting.title || !meeting.date || !meeting.category) return false
  if (meeting.category !== "online" && meeting.category !== "w_gabinecie") return false
  if (meeting.date !== targetDate) return false
  if (meeting.remindedAt) return false

  const email = meeting.userEmail?.trim().toLowerCase()
  if (!email || !email.includes("@")) return false

  return true
}

export function selectMeetingsDueForReminder(
  meetings: ReminderMeeting[],
  targetDate: string,
): Array<ReminderMeeting & { userEmail: string; title: string; category: "online" | "w_gabinecie"; date: string }> {
  return meetings.filter((m) => isMeetingDueForReminder(m, targetDate)) as Array<
    ReminderMeeting & {
      userEmail: string
      title: string
      category: "online" | "w_gabinecie"
      date: string
    }
  >
}
