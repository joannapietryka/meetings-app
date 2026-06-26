import { CALENDAR_END_HOUR, CALENDAR_START_HOUR, SESSION_DURATION } from "@/lib/calendar-types"

/** Minute marks available in time pickers (5-minute steps). */
export const FIVE_MINUTE_MARKS = [
  "00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55",
] as const

export type FiveMinuteMark = (typeof FIVE_MINUTE_MARKS)[number]

/** Start times every 5 minutes within the bookable calendar window. */
export function generateFiveMinuteTimeOptions(): string[] {
  const options: string[] = []
  for (let hour = CALENDAR_START_HOUR; hour < CALENDAR_END_HOUR; hour++) {
    for (const min of getValidMinuteMarksForHour(hour)) {
      options.push(`${String(hour).padStart(2, "0")}:${min}`)
    }
  }
  return options
}

/** Minute options that keep a 50-min session inside the calendar window for a given hour. */
export function getValidMinuteMarksForHour(hour: number): FiveMinuteMark[] {
  return FIVE_MINUTE_MARKS.filter((min) => {
    const startMinutes = hour * 60 + Number(min)
    const endMinutes = startMinutes + SESSION_DURATION
    return startMinutes >= CALENDAR_START_HOUR * 60 && endMinutes <= CALENDAR_END_HOUR * 60
  })
}

export function parseTimeParts(time: string): { hour: number; minute: FiveMinuteMark } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = match[2] as FiveMinuteMark
  if (!FIVE_MINUTE_MARKS.includes(minute)) return null
  if (getValidMinuteMarksForHour(hour).length === 0) return null
  return { hour, minute }
}

export function formatTimeParts(hour: number, minute: string): string {
  return `${String(hour).padStart(2, "0")}:${minute.padStart(2, "0")}`
}

/** Snap a time string to the hour row (HH:00) within calendar bounds. */
export function snapTimeToFullHour(time: string): string {
  const [h, m] = time.split(":").map(Number)
  const total = h * 60 + m
  const startMinutes = CALENDAR_START_HOUR * 60
  const endMinutes = CALENDAR_END_HOUR * 60 - SESSION_DURATION
  const snapped = Math.floor(total / 60) * 60
  const clamped = Math.max(startMinutes, Math.min(endMinutes, snapped))
  const nh = Math.floor(clamped / 60)
  return formatTimeParts(nh, "00")
}

/** Snap a time string to the nearest 5-minute mark within calendar bounds. */
export function snapTimeToFiveMinutes(time: string): string {
  const [h, m] = time.split(":").map(Number)
  const total = h * 60 + m
  const startMinutes = CALENDAR_START_HOUR * 60
  const endMinutes = CALENDAR_END_HOUR * 60 - SESSION_DURATION
  const snapped = Math.round(total / 5) * 5
  const clamped = Math.max(startMinutes, Math.min(endMinutes, snapped))
  const nh = Math.floor(clamped / 60)
  const nm = clamped % 60
  return formatTimeParts(nh, String(nm).padStart(2, "0"))
}
