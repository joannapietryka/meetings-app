import { CALENDAR_END_HOUR, SESSION_DURATION } from "@/lib/calendar-types"

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export function doIntervalsOverlap(
  startAMinutes: number,
  durationA: number,
  startBMinutes: number,
  durationB: number,
): boolean {
  const endA = startAMinutes + durationA
  const endB = startBMinutes + durationB
  return startAMinutes < endB && startBMinutes < endA
}

/** True when a session of `durationMinutes` starting at `startTime` ends by calendar close. */
export function slotFitsInCalendar(
  startTime: string,
  durationMinutes: number = SESSION_DURATION,
): boolean {
  return timeToMinutes(startTime) + durationMinutes <= CALENDAR_END_HOUR * 60
}

/** True when a session starting at `slot` overlaps any meeting on the same day. */
export function slotOverlapsTasks(
  slot: string,
  tasks: Array<{ time?: string | null; duration?: number | null }>,
  slotDuration: number = SESSION_DURATION,
): boolean {
  const start = timeToMinutes(slot)
  if (Number.isNaN(start)) return false
  return tasks.some((task) => {
    if (!task.time) return false
    const otherStart = timeToMinutes(task.time)
    if (Number.isNaN(otherStart)) return false
    return doIntervalsOverlap(start, slotDuration, otherStart, task.duration ?? SESSION_DURATION)
  })
}

/** True when `newSlot` overlaps any existing 50-min session on the same day. */
export function conflictsWithExistingSlots(
  newSlot: string,
  existingSlots: string[],
  durationMinutes: number = SESSION_DURATION,
): boolean {
  const newStart = timeToMinutes(newSlot)
  return existingSlots.some((slot) =>
    doIntervalsOverlap(newStart, durationMinutes, timeToMinutes(slot), durationMinutes),
  )
}

export function getScheduleSlotError(
  newSlot: string,
  existingSlots: string[],
  durationMinutes: number = SESSION_DURATION,
): string | null {
  const trimmed = newSlot.trim()
  if (!trimmed) return null
  if (existingSlots.includes(trimmed)) return "Ten termin już istnieje"
  if (!slotFitsInCalendar(trimmed, durationMinutes)) {
    return "Wizyta 50-min nie mieści się w godzinach pracy"
  }
  if (conflictsWithExistingSlots(trimmed, existingSlots, durationMinutes)) {
    return "Koliduje z innym terminem — potrzeba co najmniej 50 min wolnego czasu"
  }
  return null
}
