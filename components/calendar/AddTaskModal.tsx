"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { X } from "lucide-react"
import {
  format,
  addDays,
  addMonths,
  startOfDay,
  isWeekend,
  isBefore,
  isAfter,
  addHours,
  parseISO,
} from "date-fns"
import { pl } from "date-fns/locale"
import type { Task, TaskCategory } from "@/lib/calendar-types"
import {
  CALENDAR_END_HOUR,
  SESSION_DURATION,
  DAY_SLOTS,
  CATEGORY_COLORS,
} from "@/lib/calendar-types"

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
  }) => void | boolean | Promise<void | boolean>
  initialTitle?: string
  /** Pre-fills the patient name for a new booking only (e.g. from browser cache). Ignored when `editingTaskId` is set. */
  prefillTitle?: string
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
  /** Last calendar day (inclusive) that can be booked; start-of-day. Defaults to one month from today. */
  maxBookableDate?: Date
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
          label: format(current, "EEE, d MMM", { locale: pl }),
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
  prefillTitle,
  initialDescription,
  initialCategory,
  editingTaskId,
  showEmailField,
  initialEmail,
  daySlots,
  disabledDates,
  adminBlockedSlots,
  maxBookableDate: maxBookableDateProp,
}: AddTaskModalProps) {
  const slots = daySlots ?? DAY_SLOTS
  const isEditing = Boolean(editingTaskId)
  const now = useMemo(() => new Date(), [])
  const today = useMemo(() => startOfDay(now), [now])
  const maxBookingDate = useMemo(
    () => (maxBookableDateProp ? startOfDay(maxBookableDateProp) : addMonths(today, 1)),
    [today, maxBookableDateProp],
  )
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

  const isAdminSlotBlocked = (dateStr: string, slot: string) =>
    adminBlockedSlots?.get(dateStr)?.has(slot) ?? false

  // Ensure default date is valid (weekday within range)
  const validDefaultDate = useMemo(() => {
    const found = availableDates.find(d => d.dateStr === defaultDate)
    return found ? defaultDate : availableDates[0]?.dateStr ?? defaultDate
  }, [defaultDate, availableDates])

  const [title, setTitle] = useState(() => (initialTitle ?? prefillTitle ?? "").trim())
  const [description, setDescription] = useState(initialDescription ?? "")
  const [category, setCategory] = useState<TaskCategory>(initialCategory ?? "w_gabinecie")
  const [selectedDate, setSelectedDate] = useState(validDefaultDate)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [email, setEmail] = useState(initialEmail ?? "")
  const [emailError, setEmailError] = useState<string | null>(null)

  // Initialise time: prefer defaultTime if it's a valid slot for the date, else pick first slot
  const [time, setTime] = useState(() => {
    const dayTimeSlots = getSlotsForDate(validDefaultDate, slots)
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
  const allSlotsForSelectedDate = useMemo(
    () => (selectedDate ? getSlotsForDate(selectedDate, slots) : []),
    [selectedDate, slots],
  )

  const freeSlotsByDate = useMemo(() => {
    const map = new Map<string, string[]>()

    for (const { dateStr } of availableDates) {
      const blocked = blockedSlotsByDate.get(dateStr) ?? new Set<string>()
      const freeSlots = getSlotsForDate(dateStr, slots).filter(
        (slot) =>
          isSlotWithinBookingWindow(dateStr, slot) &&
          fitsInDay(slot) &&
          !isSlotConflicting(slot, blocked) &&
          !isAdminSlotBlocked(dateStr, slot),
      )

      map.set(dateStr, freeSlots)
    }

    return map
  }, [availableDates, blockedSlotsByDate, slots, adminBlockedSlots, now, maxBookingDate])

  const freeSlotsForSelectedDate = freeSlotsByDate.get(selectedDate) ?? []
  const hasFreeSlotsForSelectedDate = freeSlotsForSelectedDate.length > 0

  // Auto-prefill date+time when opening a new booking: prefer calendar-chosen day, else first available.
  const didInitialPrefill = useRef(false)
  useEffect(() => {
    if (isEditing) return
    if (defaultTime) return
    if (didInitialPrefill.current) return

    const tryPrefillDate = (dateStr: string): boolean => {
      const freeSlots = freeSlotsByDate.get(dateStr) ?? []
      const nextSlot = freeSlots[0]
      if (!nextSlot) return false
      setSelectedDate(dateStr)
      setTime(nextSlot)
      return true
    }

    const chosenInList = availableDates.some((d) => d.dateStr === defaultDate)
    if (chosenInList && tryPrefillDate(defaultDate)) {
      didInitialPrefill.current = true
      return
    }

    for (const { dateStr } of availableDates) {
      if (tryPrefillDate(dateStr)) {
        didInitialPrefill.current = true
        return
      }
    }
    didInitialPrefill.current = true
  }, [isEditing, defaultTime, defaultDate, availableDates, freeSlotsByDate])

  // When date changes, validate current time is still a valid slot for the new day
  useEffect(() => {
    if (isEditing) return
    if (!selectedDate) return

    if (!freeSlotsForSelectedDate.length) {
      if (time !== "") setTime("")
      return
    }

    if (time && freeSlotsForSelectedDate.includes(time)) return

    setTime(freeSlotsForSelectedDate[0] ?? "")
  }, [selectedDate, isEditing, freeSlotsForSelectedDate, time])

  const wouldConflict = useMemo(() => {
    if (!time) return false
    return isSlotConflicting(time, blockedSlots)
  }, [time, blockedSlots])

  const dateEnabledMap = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const { dateStr } of availableDates) {
      map.set(dateStr, (freeSlotsByDate.get(dateStr) ?? []).length > 0)
    }
    return map
  }, [availableDates, freeSlotsByDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!title.trim()) {
      setNameError("Proszę wpisać imię i nazwisko pacjenta.")
      return
    }

    if (showEmailField) {
      const trimmed = email.trim()
      if (!trimmed) {
        setEmailError("Proszę wpisać email pacjenta.")
        return
      }
      if (!isValidEmail(trimmed)) {
        setEmailError("Proszę wpisać poprawny email pacjenta.")
        return
      }
    }

    if (!fitsInDay(time)) {
      alert(`Wizyta kończy się po ${CALENDAR_END_HOUR}:00. Proszę wybrać wcześniejszą godzinę.`)
      return
    }

    if (!time || !hasFreeSlotsForSelectedDate) {
      alert("Brak wolnych terminów w tym dniu.")
      return
    }

    if (!isEditing && wouldConflict) {
      alert("Ten termin jest już zarezerwowany. Proszę wybrać inny termin.")
      return
    }
    setIsSubmitting(true)
    setNameError(null)
    setEmailError(null)
    let result: void | boolean
    try {
      result = await onAdd({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        date: selectedDate,
        time: time || undefined,
        duration: SESSION_DURATION,
        email: showEmailField ? email.trim() : undefined,
      })
    } catch {
      setIsSubmitting(false)
      return
    }

    if (result === false) {
      setIsSubmitting(false)
      return
    }

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
            {isEditing ? "Edytuj wizytę" : "Nowa wizyta"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            aria-label="Zamknij"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div>
            <label
              htmlFor="task-title"
              className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide"
            >
              Imię i nazwisko pacjenta
            </label>
            <input
              id="task-title"
              name="title"
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
              <label
                htmlFor="task-email"
                className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide"
              >
                Email
              </label>
              <input
                id="task-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) setEmailError(null)
                }}
                placeholder="imie.nazwisko@poczta.com"
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
            <label
              htmlFor="task-date"
              className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide"
            >
              Data (dni robocze)
            </label>
            <select
              id="task-date"
              name="date"
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
            <label
              htmlFor="task-time"
              className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide"
            >
              Godzina <span className="normal-case font-normal text-slate-600">(wizyta 50-min)</span>
            </label>
            <select
              id="task-time"
              name="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
              style={{ ...inputStyle, WebkitAppearance: "none" }}
            >
              {!time && (
                <option value="" disabled>
                  Wybierz godzinę
                </option>
              )}
              {allSlotsForSelectedDate.map((slot) => {
                const isAvailable = freeSlotsForSelectedDate.includes(slot)
                return (
                <option key={slot} value={slot} disabled={!isAvailable}>
                  {isAvailable ? slot : `${slot} (niedostępny)`}
                </option>
                )
              })}
            </select>
            {!hasFreeSlotsForSelectedDate && (
              <div
                className="mt-2 px-3 py-2 rounded-lg text-xs font-semibold font-sans"
                style={{
                  background: "rgba(254,226,226,0.25)",
                  border: "1.5px dashed rgba(239,68,68,0.3)",
                  color: "#b91c1c",
                }}
              >
                brak wolnych terminów
              </div>
            )}
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
             Ten termin jest już zarezerwowany. Wybierz inny termin.
            </div>
          )}

          {/* Session type */}
          <div>
            <label className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
              Typ wizyty
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
            <label
              htmlFor="task-description"
              className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide"
            >
              Notatki
            </label>
            <textarea
              id="task-description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opis dodatkowy..."
              rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 resize-none"
              style={inputStyle}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={(!isEditing && wouldConflict) || isSubmitting || !hasFreeSlotsForSelectedDate}
            className="w-full py-3 rounded-xl font-bold font-sans text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            style={{
              backgroundColor: "#0C115B",
              color: "white",
              boxShadow: "0 8px 24px rgba(12,17,91,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
              border: "1px solid rgba(12,17,91,0.6)",
            }}
          >
            {isSubmitting
              ? (isEditing ? "Zapisywanie..." : "Rezerwowanie...")
              : isEditing ? "Zapisz zmiany" : "Rezerwuj wizytę"}
          </button>
        </form>
      </div>
    </div>
  )
}
