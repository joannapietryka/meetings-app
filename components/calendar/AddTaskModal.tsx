"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { X } from "lucide-react"
import { format, addDays, startOfDay, isWeekend, isBefore, isAfter, addHours, parseISO } from "date-fns"
import type { Task, TaskCategory } from "@/lib/calendar-types"
import { CALENDAR_START_HOUR, CALENDAR_END_HOUR, CATEGORY_COLORS } from "@/lib/calendar-types"

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
}

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: "bed1", label: "1-bed viewing" },
  { value: "bed2", label: "2-beds viewing" },
  { value: "contract", label: "Contract signing" },
  { value: "other", label: "Other" },
]

const DURATIONS = [
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
  { label: "1.5 hr", value: 90 },
  { label: "2 hr", value: 120 },
]

// Generate available time slots: only full hour and :30 minute slots
function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = CALENDAR_START_HOUR; h < CALENDAR_END_HOUR; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`)
    slots.push(`${String(h).padStart(2, "0")}:30`)
  }
  slots.push(`${String(CALENDAR_END_HOUR).padStart(2, "0")}:00`)
  return slots
}

const ALL_TIME_SLOTS = generateTimeSlots()

function fitsInDay(time: string, durationMinutes: number): boolean {
  const [h, m] = time.split(":").map(Number)
  const startMinutes = h * 60 + m
  const endMinutes = startMinutes + durationMinutes
  const dayEndMinutes = CALENDAR_END_HOUR * 60
  return endMinutes <= dayEndMinutes
}

// Generate available dates: next 14 days (weekdays only)
function generateAvailableDates(): { date: Date; dateStr: string; label: string }[] {
  const today = startOfDay(new Date())
  const maxDate = addDays(today, 14)
  const dates: { date: Date; dateStr: string; label: string }[] = []
  
  let current = today
  while (!isAfter(current, maxDate)) {
    if (!isWeekend(current)) {
      dates.push({
        date: current,
        dateStr: format(current, "yyyy-MM-dd"),
        label: format(current, "EEE, MMM d"),
      })
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
}: AddTaskModalProps) {
  const isEditing = !!initialTitle
  const availableDates = useMemo(() => generateAvailableDates(), [])
  const now = useMemo(() => new Date(), [])
  const today = useMemo(() => startOfDay(now), [now])
  const maxBookingDate = useMemo(() => addDays(today, 14), [today])

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

  const isSlotConflictingWithDuration = (startSlot: string, durationMinutes: number, blocked: Set<string>) => {
    const [h, m] = startSlot.split(":").map(Number)
    const startMinutes = h * 60 + m

    for (let offset = 0; offset < durationMinutes; offset += 30) {
      const checkMinutes = startMinutes + offset
      const checkH = Math.floor(checkMinutes / 60)
      const checkM = checkMinutes % 60
      const checkSlot = `${String(checkH).padStart(2, "0")}:${String(checkM).padStart(2, "0")}`
      if (blocked.has(checkSlot)) return true
    }

    return false
  }
  
  // Ensure default date is valid (weekday within range)
  const validDefaultDate = useMemo(() => {
    const found = availableDates.find(d => d.dateStr === defaultDate)
    return found ? defaultDate : availableDates[0]?.dateStr ?? defaultDate
  }, [defaultDate, availableDates])

  const [title, setTitle] = useState(initialTitle ?? "")
  const [description, setDescription] = useState(initialDescription ?? "")
  const [category, setCategory] = useState<TaskCategory>(initialCategory ?? "bed1")
  const [selectedDate, setSelectedDate] = useState(validDefaultDate)
  const [time, setTime] = useState(defaultTime && ALL_TIME_SLOTS.includes(defaultTime) ? defaultTime : "09:00")
  const [duration, setDuration] = useState(30)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [email, setEmail] = useState(initialEmail ?? "")
  const [emailError, setEmailError] = useState<string | null>(null)

  const isValidEmail = (value: string) => {
    // Simple RFC5322-ish email check: something@something.something
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  const blockedSlotsByDate = useMemo(() => {
    const map = new Map<string, Set<string>>()

    for (const { dateStr } of availableDates) {
      const blocked = new Set<string>()
      const dayTasks = existingTasks
        .filter((t) => t.date === dateStr)
        .filter((t) => {
          if (!isEditing) return true
          if (!editingTaskId) return true
          return t.id !== editingTaskId
        })

      dayTasks.forEach((task) => {
        if (!task.time) return
        const [h, m] = task.time.split(":").map(Number)
        const startMinutes = h * 60 + m
        const taskDuration = task.duration || 30

        // Mark all slots that overlap with this task (each slot is 30 minutes).
        ALL_TIME_SLOTS.forEach((slot) => {
          const [slotH, slotM] = slot.split(":").map(Number)
          const slotStartMinutes = slotH * 60 + slotM
          const slotEndMinutes = slotStartMinutes + 30

          if (
            (slotStartMinutes >= startMinutes && slotStartMinutes < startMinutes + taskDuration) ||
            (slotEndMinutes > startMinutes && slotEndMinutes <= startMinutes + taskDuration) ||
            (slotStartMinutes <= startMinutes && slotEndMinutes >= startMinutes + taskDuration)
          ) {
            blocked.add(slot)
          }
        })
      })

      map.set(dateStr, blocked)
    }

    return map
  }, [availableDates, existingTasks])

  const blockedSlots = blockedSlotsByDate.get(selectedDate) ?? new Set<string>()

  // For new meetings without an explicit defaultTime, prefill with the first available date+time.
  const didInitialPrefill = useRef(false)
  useEffect(() => {
    if (isEditing) return
    if (defaultTime) return
    if (didInitialPrefill.current) return

    for (const { dateStr } of availableDates) {
      const blocked = blockedSlotsByDate.get(dateStr) ?? new Set<string>()
      for (const slot of ALL_TIME_SLOTS) {
        if (!isSlotWithinBookingWindow(dateStr, slot)) continue
        if (!fitsInDay(slot, duration)) continue
        if (isSlotConflictingWithDuration(slot, duration, blocked)) continue

        setSelectedDate(dateStr)
        setTime(slot)
        didInitialPrefill.current = true
        return
      }
    }

    didInitialPrefill.current = true
  }, [isEditing, defaultTime, availableDates, blockedSlotsByDate, duration, now, maxBookingDate])

  // If user changes duration and the current selection becomes invalid, auto-pick the first valid time for the selected date.
  useEffect(() => {
    if (isEditing) return
    if (!selectedDate) return
    if (!time) return

    const blocked = blockedSlotsByDate.get(selectedDate) ?? new Set<string>()
    const selectionInvalid =
      !isSlotWithinBookingWindow(selectedDate, time) ||
      !fitsInDay(time, duration) ||
      isSlotConflictingWithDuration(time, duration, blocked)

    if (!selectionInvalid) return

    for (const slot of ALL_TIME_SLOTS) {
      if (!isSlotWithinBookingWindow(selectedDate, slot)) continue
      if (!fitsInDay(slot, duration)) continue
      if (isSlotConflictingWithDuration(slot, duration, blocked)) continue
      setTime(slot)
      return
    }
  }, [duration, selectedDate, time, isEditing, blockedSlotsByDate, now, maxBookingDate])

  // Check if the selected time + duration would conflict
  const wouldConflict = useMemo(() => {
    if (!time) return false
    return isSlotConflictingWithDuration(time, duration, blockedSlots)
  }, [time, duration, blockedSlots])

  const dateEnabledMap = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const { dateStr } of availableDates) {
      const blocked = blockedSlotsByDate.get(dateStr) ?? new Set<string>()
      let enabled = false

      for (const slot of ALL_TIME_SLOTS) {
        if (!isSlotWithinBookingWindow(dateStr, slot)) continue
        if (!fitsInDay(slot, duration)) continue
        if (isSlotConflictingWithDuration(slot, duration, blocked)) continue
        enabled = true
        break
      }

      map.set(dateStr, enabled)
    }
    return map
  }, [availableDates, blockedSlotsByDate, duration, now, maxBookingDate])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!title.trim()) {
      setNameError("Please enter the guest name.")
      return
    }

    if (showEmailField) {
      const trimmed = email.trim()
      if (!trimmed) {
        setEmailError("Please enter the guest email.")
        return
      }
      if (!isValidEmail(trimmed)) {
        setEmailError("Please enter a valid email address.")
        return
      }
    }

    // Ensure the chosen duration fits before end of day (17:00)
    if (!fitsInDay(time, duration)) {
      alert("This meeting would end after 17:00. Please choose an earlier time or shorter duration.")
      return
    }

    if (!initialTitle && wouldConflict) {
      // Only enforce conflict rule when creating a new meeting.
      alert("This time slot is already booked. Please choose a different time or duration.")
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
      duration,
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
            {isEditing ? "Edit Meeting" : "New Meeting"}
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
              Name
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
                placeholder="guest@example.com"
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

          {/* Time selector */}
          <div>
            <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
              Time
            </label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans cursor-pointer"
              style={{ ...inputStyle, WebkitAppearance: "none" }}
            >
              {ALL_TIME_SLOTS.map(slot => {
                const isOutsideWindow = !isSlotWithinBookingWindow(selectedDate, slot)
                const isConflicting = isSlotConflictingWithDuration(slot, duration, blockedSlots)
                const isDisabled = isOutsideWindow || isConflicting
                const isBlocked = blockedSlots.has(slot)
                return (
                  <option 
                    key={slot} 
                    value={slot}
                    disabled={isDisabled}
                    style={{ 
                      background: isDisabled ? "#fef2f2" : "#fff", 
                      color: isDisabled ? "#ef4444" : "#1e293b" 
                    }}
                  >
                    {slot}
                    {isBlocked ? " (booked)" : isOutsideWindow ? " (unavailable)" : isConflicting ? " (unavailable)" : ""}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
              Duration
            </label>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => {
                    if (!fitsInDay(time, d.value)) return
                    setDuration(d.value)
                  }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all duration-150"
                  style={{
                    background: !fitsInDay(time, d.value)
                      ? "rgba(0,0,0,0.02)"
                      : duration === d.value
                      ? "rgba(12,17,91,0.12)"
                      : "rgba(0,0,0,0.05)",
                    border: !fitsInDay(time, d.value)
                      ? "1px solid rgba(0,0,0,0.05)"
                      : duration === d.value
                      ? "1px solid rgba(12,17,91,0.4)"
                      : "1px solid rgba(0,0,0,0.1)",
                    color: !fitsInDay(time, d.value)
                      ? "#cbd5f5"
                      : duration === d.value
                      ? "#0C115B"
                      : "#64748b",
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conflict warning (only when creating a new meeting) */}
          {!isEditing && wouldConflict && (
            <div 
              className="px-3 py-2 rounded-lg text-xs font-sans"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#991b1b"
              }}
            >
              This time slot conflicts with an existing meeting. Choose a different time or duration.
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
              Category
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
            {isSubmitting ? (isEditing ? "Saving..." : "Adding...") : isEditing ? "Save changes" : "Add Meeting"}
          </button>
        </form>
      </div>
    </div>
  )
}
