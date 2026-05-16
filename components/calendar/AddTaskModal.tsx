"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { X } from "lucide-react"
import { format, addDays, startOfDay, isWeekend, isBefore, isAfter, addHours, parseISO } from "date-fns"
import type { Task, TaskCategory } from "@/lib/calendar-types"
import {
  CALENDAR_END_HOUR,
  SESSION_DURATION,
  DAY_SLOTS,
  CATEGORY_COLORS,
} from "@/lib/calendar-types"
import { addMonths } from "date-fns"

interface AddTaskModalProps {
  defaultDate: string
  defaultTime?: string
  existingTasks: Task[]
  onClose: () => void
  onAdd: (task: {
    title: string
    description?: string
    category: TaskCategory
    date: string
    time?: string
    duration?: number
    email?: string
  }) => void
  initialTitle?: string
  initialDescription?: string
  initialCategory?: TaskCategory
  editingTaskId?: string
  showEmailField?: boolean
  initialEmail?: string
  /** Dynamic schedule from DB — falls back to the hardcoded DAY_SLOTS constant when omitted. */
  daySlots?: Record<number, string[]>
  /** Dates the current user is not allowed to book (already has a meeting that day, or weekly cap reached). */
  disabledDates?: Set<string>
  /** Admin-blocked individual slots: date → set of blocked times. */
  adminBlockedSlots?: Map<string, Set<string>>
}

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: "w_gabinecie", label: "W gabinecie" },
  { value: "online",      label: "Online" },
]

/** Returns the psychologist slots available for the given date string. */
function getSlotsForDate(dateStr: string, slots: Record<number, string[]>): string[] {
  const dayOfWeek = parseISO(dateStr).getDay()
  return slots[dayOfWeek] ?? []
}

/** True if a 50-min session starting at `time` finishes before the calendar end. */
function fitsInDay(time: string): boolean {
  const [h, m] = time.split(":").map(Number)
  const endMinutes = h * 60 + m + SESSION_DURATION
  return endMinutes <= CALENDAR_END_HOUR * 60
}

/** Generate available dates: up to maxDate, weekdays only, that have at least one slot. */
function generateAvailableDates(
  slots: Record<number, string[]>,
  maxDate: Date,
): { date: Date; dateStr: string; label: string }[] {
  const today = startOfDay(new Date())
  const dates: { date: Date; dateStr: string; label: string }[] = []

  let current = today
  while (!isAfter(current, maxDate)) {
    if (!isWeekend(current)) {
      const dateStr = format(current, "yyyy-MM-dd")
      if (getSlotsForDate(dateStr, slots).length > 0) {
        dates.push({
          date: current,
          dateStr,
          label: format(current, "EEE, MMM d"),
        })
      }
    }
    current = addDays(current, 1)
  }

  return dates
}

export function AddTaskModal({
  defaultDate,
  defaultTime,
  existingTasks,
  onClose,
  onAdd,
  initialTitle,
  initialDescription,
  initialCategory,
  editingTaskId,
  showEmailField,
  initialEmail,
  daySlots,
  disabledDates,
  adminBlockedSlots,
}: AddTaskModalProps) {
  const slots = daySlots ?? DAY_SLOTS
  const isEditing = !!initialTitle
  const now = useMemo(() => new Date(), [])
  const today = useMemo(() => startOfDay(now), [now])
  const maxBookingDate = useMemo(() => addMonths(today, 1), [today])
  const availableDates = useMemo(
    () => generateAvailableDates(slots, maxBookingDate).filter(
      (d) => !disabledDates?.has(d.dateStr)
    ),
    [slots, maxBookingDate, disabledDates],
  )

  const isSlotWithinBookingWindow = (dateStr: string, slot: string) => {
    const [h, m] = slot.split(":").map(Number)
    const date = parseISO(dateStr)
    const slotDateTime = new Date(date)
    slotDateTime.setHours(h, m, 0, 0)
    const minBookingDateTime = addHours(now, 2)
    if (isBefore(slotDateTime, minBookingDateTime)) return false
    if (isAfter(startOfDay(date), maxBookingDate)) return false
    return true
  }

  // Two 50-min sessions conflict if their start times are identical (slots are spaced >50 min apart)
  const isSlotConflicting = (startSlot: string, blocked: Set<string>) => {
    return blocked.has(startSlot)
  }

  // Ensure default date is valid (weekday within range)
  const validDefaultDate = useMemo(() => {
    const found = availableDates.find(d => d.dateStr === defaultDate)
    return found ? defaultDate : availableDates[0]?.dateStr ?? defaultDate
  }, [defaultDate, availableDates])

  const [title, setTitle] = useState(initialTitle ?? "")
  const [description, setDescription] = useState(initialDescription ?? "")
  const [category, setCategory] = useState<TaskCategory>(initialCategory ?? "w_gabinecie")
  const [selectedDate, setSelectedDate] = useState(validDefaultDate)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [email, setEmail] = useState(initialEmail ?? "")
  const [emailError, setEmailError] = useState<string | null>(null)

  // Initialise time: prefer defaultTime if it's a valid slot for the date, else pick first slot
  const [time, setTime] = useState(() => {
    const dayTimeSlots = getSlotsForDate(defaultDate, slots)
    if (defaultTime && dayTimeSlots.includes(defaultTime)) return defaultTime
    return dayTimeSlots[0] ?? ""
  })

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  // blocked start times per date (exact meeting start times of other sessions)
  const blockedSlotsByDate = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const { dateStr } of availableDates) {
      const blocked = new Set<string>()
      existingTasks
        .filter((t) => t.date === dateStr)
        .filter((t) => {
          if (!isEditing || !editingTaskId) return true
          return t.id !== editingTaskId
        })
        .forEach((task) => {
          if (task.time) blocked.add(task.time)
        })
      map.set(dateStr, blocked)
    }
    return map
  }, [availableDates, existingTasks, isEditing, editingTaskId])

  const blockedSlots = blockedSlotsByDate.get(selectedDate) ?? new Set<string>()

  // Auto-prefill the first valid date+time when opening a new booking
  const didInitialPrefill = useRef(false)
  useEffect(() => {
    if (isEditing) return
    if (defaultTime) return
    if (didInitialPrefill.current) return

    for (const { dateStr } of availableDates) {
      const dayTimeSlots = getSlotsForDate(dateStr, slots)
      const blocked = blockedSlotsByDate.get(dateStr) ?? new Set<string>()
      for (const slot of dayTimeSlots) {
        if (!isSlotWithinBookingWindow(dateStr, slot)) continue
        if (!fitsInDay(slot)) continue
        if (isSlotConflicting(slot, blocked)) continue
        setSelectedDate(dateStr)
        setTime(slot)
        didInitialPrefill.current = true
        return
      }
    }
    didInitialPrefill.current = true
  }, [isEditing, defaultTime, availableDates, blockedSlotsByDate, now, maxBookingDate])

  // When date changes, validate current time is still a valid slot for the new day
  useEffect(() => {
    if (isEditing) return
    if (!selectedDate || !time) return

    const dayTimeSlots = getSlotsForDate(selectedDate, slots)
    const blocked = blockedSlotsByDate.get(selectedDate) ?? new Set<string>()
    const selectionInvalid =
      !dayTimeSlots.includes(time) ||
      !isSlotWithinBookingWindow(selectedDate, time) ||
      isSlotConflicting(time, blocked)

    if (!selectionInvalid) return

    for (const slot of dayTimeSlots) {
      if (!isSlotWithinBookingWindow(selectedDate, slot)) continue
      if (isSlotConflicting(slot, blocked)) continue
      setTime(slot)
      return
    }
  }, [selectedDate, isEditing, blockedSlotsByDate, now, maxBookingDate])

  const wouldConflict = useMemo(() => {
    if (!time) return false
    return isSlotConflicting(time, blockedSlots)
  }, [time, blockedSlots])

  const dateEnabledMap = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const { dateStr } of availableDates) {
      const blocked = blockedSlotsByDate.get(dateStr) ?? new Set<string>()
      const dayTimeSlots = getSlotsForDate(dateStr, slots)
      const enabled = dayTimeSlots.some(
        (slot) =>
          isSlotWithinBookingWindow(dateStr, slot) &&
          fitsInDay(slot) &&
          !isSlotConflicting(slot, blocked)
      )
      map.set(dateStr, enabled)
    }
    return map
  }, [availableDates, blockedSlotsByDate, now, maxBookingDate])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!title.trim()) {
      setNameError("Please enter the client name.")
      return
    }

    if (showEmailField) {
      const trimmed = email.trim()
      if (!trimmed) {
        setEmailError("Please enter the client email.")
        return
      }
      if (!isValidEmail(trimmed)) {
        setEmailError("Please enter a valid email address.")
        return
      }
    }

    if (!fitsInDay(time)) {
      alert(`This session would end after ${CALENDAR_END_HOUR}:00. Please choose an earlier time.`)
      return
    }

    if (!isEditing && wouldConflict) {
      alert("This time slot is already booked. Please choose a different time.")
      return
    }
    setIsSubmitting(true)
    setNameError(null)
    setEmailError(null)
    onAdd({
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      date: selectedDate,
      time: time || undefined,
      duration: SESSION_DURATION,
      email: showEmailField ? email.trim() : undefined,
    })
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.55)",
    border: "1px solid rgba(0,0,0,0.1)",
    backdropFilter: "blur(10px)",
    color: "#1e293b",
    outline: "none",
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.2)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(40px) saturate(200%)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.15), inset 0 2px 0 rgba(255,255,255,0.8)",
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-slate-800 text-lg font-bold font-sans">
            {isEditing ? "Edit Session" : "New Session"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div>
            <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
              Client name
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (nameError) setNameError(null)
              }}
              placeholder="e.g. Anna Kowalska"
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 focus:border-slate-300 transition-colors"
              style={inputStyle}
            />
            {nameError && (
              <p className="mt-1 text-[11px] text-red-600 font-sans">
                {nameError}
              </p>
            )}
          </div>

          {showEmailField && (
            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) setEmailError(null)
                }}
                placeholder="client@example.com"
                className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 focus:border-slate-300 transition-colors"
                style={inputStyle}
              />
              {emailError && (
                <p className="mt-1 text-[11px] text-red-600 font-sans">
                  {emailError}
                </p>
              )}
            </div>
          )}

          {/* Date selector */}
          <div>
            <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
              Date (next 2 weeks, weekdays only)
            </label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans cursor-pointer"
              style={{ ...inputStyle, WebkitAppearance: "none" }}
            >
              {availableDates.map(({ dateStr, label }) => (
                <option key={dateStr} value={dateStr} disabled={!dateEnabledMap.get(dateStr)}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Time selector — shows only the psychologist slots for the selected day */}
          <div>
            <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
              Time <span className="normal-case font-normal text-slate-400">(50-min session)</span>
            </label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans cursor-pointer"
              style={{ ...inputStyle, WebkitAppearance: "none" }}
            >
              {getSlotsForDate(selectedDate, slots).map(slot => {
                const isOutsideWindow = !isSlotWithinBookingWindow(selectedDate, slot)
                const isConflicting = isSlotConflicting(slot, blockedSlots)
                const isAdminBlocked = adminBlockedSlots?.get(selectedDate)?.has(slot) ?? false
                const isDisabled = isOutsideWindow || isConflicting || isAdminBlocked
                return (
                  <option
                    key={slot}
                    value={slot}
                    disabled={isDisabled}
                    style={{
                      background: isDisabled ? "#fef2f2" : "#fff",
                      color: isDisabled ? "#ef4444" : "#1e293b",
                    }}
                  >
                    {slot}
                    {isConflicting
                      ? " (booked)"
                      : isOutsideWindow
                        ? " (unavailable)"
                        : ""}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Conflict warning (only when creating a new session) */}
          {!isEditing && wouldConflict && (
            <div
              className="px-3 py-2 rounded-lg text-xs font-sans"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#991b1b",
              }}
            >
              This time slot is already booked. Choose a different time.
            </div>
          )}

          {/* Session type */}
          <div>
            <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
              Session type
            </label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map((cat) => {
                const colors = CATEGORY_COLORS[cat.value]
                const isSelected = category === cat.value
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all duration-150 flex items-center gap-1.5"
                    style={{
                      background: isSelected ? colors.bg : "rgba(0,0,0,0.05)",
                      border: isSelected ? `1px solid ${colors.border}` : "1px solid rgba(0,0,0,0.1)",
                      color: isSelected ? colors.dot : "#64748b",
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: colors.dot }}
                    />
                    {cat.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
              Notes
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes..."
              rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 resize-none"
              style={inputStyle}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={(!isEditing && wouldConflict) || isSubmitting}
            className="w-full py-3 rounded-xl font-bold font-sans text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            style={{
              backgroundColor: "#0C115B",
              color: "white",
              boxShadow: "0 8px 24px rgba(12,17,91,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
              border: "1px solid rgba(12,17,91,0.6)",
            }}
          >
            {isSubmitting
              ? (isEditing ? "Saving..." : "Booking...")
              : isEditing ? "Save changes" : "Book session"}
          </button>
        </form>
      </div>
    </div>
  )
}
