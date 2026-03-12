"use client"

import { useState, useRef, useMemo } from "react"
import { startOfWeek, addWeeks, subWeeks, format, addDays, isBefore, isAfter, startOfDay, addHours, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react"
import type { Task, TaskCategory } from "@/lib/calendar-types"
import {
  CALENDAR_START_HOUR,
  SLOT_MINUTES,
  TOTAL_SLOTS,
  SLOT_HEIGHT_PX,
} from "@/lib/calendar-types"
import { DayColumn } from "@/components/calendar/DayColumn"
import { AddTaskModal } from "@/components/calendar/AddTaskModal"

// Helper to get ISO date string
function toDateStr(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

// Generate sample tasks with actual dates
function generateInitialTasks(): Task[] {
  const today = startOfDay(new Date())
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 })
  
  return [
    { id: "1", title: "Anna Kowalska", category: "work", date: toDateStr(addDays(currentWeekStart, 0)), time: "09:00", duration: 30 },
    { id: "2", title: "John Smith", category: "work", date: toDateStr(addDays(currentWeekStart, 0)), time: "14:00", duration: 60 },
    { id: "3", title: "Emily Johnson", category: "health", date: toDateStr(addDays(currentWeekStart, 1)), time: "09:00", duration: 60 },
    { id: "4", title: "Michael Brown", category: "work", date: toDateStr(addDays(currentWeekStart, 2)), time: "10:00", duration: 90 },
    { id: "5", title: "Sarah Davis", category: "personal", date: toDateStr(addDays(currentWeekStart, 2)), time: "12:30", duration: 60 },
    { id: "6", title: "David Wilson", category: "work", date: toDateStr(addDays(currentWeekStart, 3)), time: "11:00", duration: 30 },
    { id: "7", title: "Olivia Martinez", category: "health", date: toDateStr(addDays(currentWeekStart, 4)), time: "09:00", duration: 60 },
    { id: "8", title: "James Taylor", category: "work", date: toDateStr(addDays(currentWeekStart, 4)), time: "15:00", duration: 60 },
  ]
}

// Time gutter labels: show full hour labels only
const TIME_LABELS: string[] = []
for (let h = CALENDAR_START_HOUR; h <= 17; h++) {
  TIME_LABELS.push(h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`)
}

export default function WeeklyCalendarPage() {
  const today = useMemo(() => startOfDay(new Date()), [])
  const now = useMemo(() => new Date(), [])
  const maxBookingDate = useMemo(() => addDays(today, 14), [today])
  const currentWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today])
  
  // Calculate the valid week range (3 weeks total)
  const minWeekStart = currentWeekStart
  const maxWeekStart = addWeeks(currentWeekStart, 2)
  
  const [weekStart, setWeekStart] = useState(() => currentWeekStart)
  const [tasks, setTasks] = useState<Task[]>(() => generateInitialTasks())
  const [modalConfig, setModalConfig] = useState<{ date: string; time?: string } | null>(null)
  const draggingId = useRef<string | null>(null)
  const dragOffsetY = useRef<number>(0)

  const weekEndDate = addDays(weekStart, 6)
  const weekLabel = `${format(weekStart, "MMM d")} – ${format(weekEndDate, "MMM d, yyyy")}`

  // Check if navigation is allowed
  const canGoPrev = isAfter(weekStart, minWeekStart) || toDateStr(weekStart) !== toDateStr(minWeekStart)
  const canGoNext = isBefore(weekStart, maxWeekStart)

  const minBookingDateTime = useMemo(() => addHours(now, 2), [now])

  const isSlotBookable = (date: Date, time: string) => {
    const [h, m] = time.split(":").map(Number)
    const slotDateTime = new Date(date)
    slotDateTime.setHours(h, m, 0, 0)

    // Cannot book in the past or less than 2 hours in advance
    if (isBefore(slotDateTime, minBookingDateTime)) return false

    // Cannot book more than 2 weeks ahead
    if (isAfter(startOfDay(date), maxBookingDate)) return false

    return true
  }

  const handlePrevWeek = () => {
    if (!isBefore(weekStart, minWeekStart) && toDateStr(weekStart) !== toDateStr(minWeekStart)) {
      setWeekStart((w) => subWeeks(w, 1))
    }
  }

  const handleNextWeek = () => {
    if (isBefore(weekStart, maxWeekStart)) {
      setWeekStart((w) => addWeeks(w, 1))
    }
  }

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    draggingId.current = taskId
    e.dataTransfer.effectAllowed = "move"
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragOffsetY.current = e.clientY - rect.top
  }

  const handleDrop = (e: React.DragEvent, targetDate: string, gridTop: number) => {
    e.preventDefault()
    if (!draggingId.current) return

    // Calculate which slot the top border of the card lands on
    const relativeY = e.clientY - dragOffsetY.current - gridTop
    const slotIndex = Math.max(0, Math.min(TOTAL_SLOTS - 1, Math.floor(relativeY / SLOT_HEIGHT_PX)))
    const totalMinutes = CALENDAR_START_HOUR * 60 + slotIndex * SLOT_MINUTES
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    const newTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`

    const targetDateObj = parseISO(targetDate)
    if (!isSlotBookable(targetDateObj, newTime)) {
      draggingId.current = null
      return
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === draggingId.current ? { ...t, date: targetDate, time: newTime } : t))
    )
    draggingId.current = null
  }

  const handleDelete = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
  }

  const handleAddTask = (payload: {
    title: string
    description?: string
    category: TaskCategory
    date: string
    time?: string
    duration?: number
  }) => {
    setTasks((prev) => [...prev, { ...payload, id: crypto.randomUUID() }])
  }

  return (
    <div
      className="h-screen max-h-screen flex flex-col overflow-hidden"
      style={{
        backgroundImage: "url('/images/bg-green-gradient.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Header */}
      <header className="relative z-10 px-6 pt-6 pb-4 flex-shrink-0">
        <div
          className="max-w-full mx-auto rounded-2xl px-5 py-3.5 flex items-center justify-between"
          style={{
            background: "rgba(255,255,255,0.28)",
            backdropFilter: "blur(30px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.45)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.08), inset 0 2px 0 rgba(255,255,255,0.6)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl"
              style={{
                background: "rgba(12,17,91,0.7)",
                border: "1px solid rgba(12,17,91,0.5)",
                boxShadow: "0 4px 12px rgba(12,17,91,0.3)",
              }}
            >
              <CalendarDays className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-slate-800 font-bold text-lg font-sans leading-tight">Weekly Planner</h1>
              <p className="text-slate-500 text-xs font-sans">{weekLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevWeek}
              disabled={!canGoPrev}
              className="p-2 rounded-xl transition-all duration-200 hover:bg-white/40 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              style={{ border: "1px solid rgba(0,0,0,0.1)" }}
              aria-label="Previous week"
            >
              <ChevronLeft className="w-4 h-4 text-slate-700" />
            </button>
            <button
              onClick={() => setWeekStart(currentWeekStart)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold font-sans text-slate-700 transition-all duration-200 hover:bg-white/40"
              style={{ border: "1px solid rgba(0,0,0,0.1)" }}
            >
              Today
            </button>
            <button
              onClick={handleNextWeek}
              disabled={!canGoNext}
              className="p-2 rounded-xl transition-all duration-200 hover:bg-white/40 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              style={{ border: "1px solid rgba(0,0,0,0.1)" }}
              aria-label="Next week"
            >
              <ChevronRight className="w-4 h-4 text-slate-700" />
            </button>
            <button
              onClick={() => setModalConfig({ date: toDateStr(addDays(weekStart, 0)) })}
              className="ml-1 flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold font-sans text-sm text-white transition-all duration-200 hover:-translate-y-0.5"
              style={{
                backgroundColor: "#0C115B",
                boxShadow: "0 4px 16px rgba(12,17,91,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                border: "1px solid rgba(12,17,91,0.6)",
              }}
            >
              <Plus className="w-4 h-4" />
              New Meeting
            </button>
          </div>
        </div>
      </header>

      {/* Calendar body */}
      <main className="relative z-10 flex-1 px-6 pb-4 overflow-hidden">
        {/* Legend */}
        <div className="flex items-center gap-5 mb-3 px-1">
          {(["work", "personal", "health", "other"] as const).map((cat) => {
            const label =
              cat === "work"
                ? "1-bed viewing"
                : cat === "personal"
                ? "2-beds viewing"
                : cat === "health"
                ? "Contract signing"
                : "Other"
            return (
            <div key={cat} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor:
                    cat === "work" ? "#4338ca" :
                    cat === "personal" ? "#d97706" :
                    cat === "health" ? "#059669" : "#9ca3af",
                }}
              />
              <span className="text-slate-600 text-[11px] font-sans">{label}</span>
            </div>
          )})}
          <span className="ml-auto text-slate-400 text-[11px] font-sans">Drag meetings between days · Click a slot to add</span>
        </div>

        {/* Time gutter + columns */}
        <div className="flex gap-0">
          {/* Time gutter */}
          <div
            className="flex-shrink-0 pr-2 pt-[52px]"
            style={{ width: 44 }}
          >
            {TIME_LABELS.map((label, i) => (
              <div
                key={label}
                className="flex items-start justify-end"
                style={{ height: i < TIME_LABELS.length - 1 ? SLOT_HEIGHT_PX * 2 : 0 }}
              >
                <span className="text-slate-500 text-[10px] font-sans -translate-y-2 leading-none">
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns — weekdays full width, weekends narrow */}
          <div className="flex gap-2 flex-1 min-w-0">
            {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
              const dayDate = addDays(weekStart, dayOffset)
              const dateStr = toDateStr(dayDate)
              const isWeekend = dayOffset >= 5
              const isBeforeToday = isBefore(dayDate, today)
              const isAfterBookingWindow = isAfter(startOfDay(dayDate), maxBookingDate)
              const isLocked = isBeforeToday || isAfterBookingWindow
              return (
                <div
                  key={dayOffset}
                  style={{ flex: isWeekend ? "0 0 36px" : "1 1 0" }}
                >
                  <DayColumn
                    date={dayDate}
                    dateStr={dateStr}
                    tasks={tasks.filter((t) => t.date === dateStr)}
                    isWeekend={isWeekend}
                    isLocked={isLocked}
                    canBookSlot={(time) => isSlotBookable(dayDate, time)}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    onDelete={handleDelete}
                    onAddTask={(date, time) => setModalConfig({ date, time })}
                    onWeekendHover={
                      isWeekend && canGoNext
                        ? () => {
                            if (canGoNext) {
                              setWeekStart((w) => addWeeks(w, 1))
                            }
                          }
                        : undefined
                    }
                  />
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* Add Task Modal */}
      {modalConfig !== null && (
        <AddTaskModal
          defaultDate={modalConfig.date}
          defaultTime={modalConfig.time}
          existingTasks={tasks}
          onClose={() => setModalConfig(null)}
          onAdd={handleAddTask}
        />
      )}
    </div>
  )
}
