"use client"

import { useState, useMemo } from "react"
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
  }) => void
}

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: "work", label: "1-bed viewing" },
  { value: "personal", label: "2-beds viewing" },
  { value: "health", label: "Contract signing" },
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
  onAdd 
}: AddTaskModalProps) {
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
  
  // Ensure default date is valid (weekday within range)
  const validDefaultDate = useMemo(() => {
    const found = availableDates.find(d => d.dateStr === defaultDate)
    return found ? defaultDate : availableDates[0]?.dateStr ?? defaultDate
  }, [defaultDate, availableDates])

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<TaskCategory>("work")
  const [selectedDate, setSelectedDate] = useState(validDefaultDate)
  const [time, setTime] = useState(defaultTime && ALL_TIME_SLOTS.includes(defaultTime) ? defaultTime : "09:00")
  const [duration, setDuration] = useState(30)

  // Get blocked time slots for the selected date
  const blockedSlots = useMemo(() => {
    const blocked = new Set<string>()
    const dayTasks = existingTasks.filter(t => t.date === selectedDate)
    
    dayTasks.forEach(task => {
      if (!task.time) return
      const [h, m] = task.time.split(':').map(Number)
      const startMinutes = h * 60 + m
      const taskDuration = task.duration || 30
      
      // Mark all slots that overlap with this task
      ALL_TIME_SLOTS.forEach(slot => {
        const [slotH, slotM] = slot.split(':').map(Number)
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
    
    return blocked
  }, [selectedDate, existingTasks])

  // Check if the selected time + duration would conflict
  const wouldConflict = useMemo(() => {
    if (!time) return false
    const [h, m] = time.split(':').map(Number)
    const startMinutes = h * 60 + m
    
    for (let offset = 0; offset < duration; offset += 30) {
      const checkMinutes = startMinutes + offset
      const checkH = Math.floor(checkMinutes / 60)
      const checkM = checkMinutes % 60
      const checkSlot = `${String(checkH).padStart(2, "0")}:${String(checkM).padStart(2, "0")}`
      if (blockedSlots.has(checkSlot)) {
        return true
      }
    }
    return false
  }, [time, duration, blockedSlots])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    if (wouldConflict) {
      alert("This time slot is already booked. Please choose a different time or duration.")
      return
    }
    onAdd({
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      date: selectedDate,
      time: time || undefined,
      duration,
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
          <h2 className="text-slate-800 text-lg font-bold font-sans">New Meeting</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
              Title
            </label>
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 focus:border-slate-300 transition-colors"
              style={inputStyle}
            />
          </div>

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
                <option key={dateStr} value={dateStr}>
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
                const isBlocked = blockedSlots.has(slot) || isOutsideWindow
                return (
                  <option 
                    key={slot} 
                    value={slot}
                    disabled={isBlocked}
                    style={{ 
                      background: isBlocked ? "#fef2f2" : "#fff", 
                      color: isBlocked ? "#ef4444" : "#1e293b" 
                    }}
                  >
                    {slot}
                    {blockedSlots.has(slot) ? " (booked)" : isOutsideWindow ? " (unavailable)" : ""}
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
                  onClick={() => setDuration(d.value)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all duration-150"
                  style={{
                    background: duration === d.value ? "rgba(12,17,91,0.12)" : "rgba(0,0,0,0.05)",
                    border: duration === d.value ? "1px solid rgba(12,17,91,0.4)" : "1px solid rgba(0,0,0,0.1)",
                    color: duration === d.value ? "#0C115B" : "#64748b",
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conflict warning */}
          {wouldConflict && (
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
            disabled={wouldConflict}
            className="w-full py-3 rounded-xl font-bold font-sans text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            style={{
              backgroundColor: "#0C115B",
              color: "white",
              boxShadow: "0 8px 24px rgba(12,17,91,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
              border: "1px solid rgba(12,17,91,0.6)",
            }}
          >
            Add Meeting
          </button>
        </form>
      </div>
    </div>
  )
}
