"use client"

import { useMemo, useRef, useState } from "react"
import { addDays, addHours, addWeeks, format, isAfter, isBefore, parseISO, startOfDay, startOfWeek, subWeeks } from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Ban } from "lucide-react"
import type { TaskCategory } from "@/lib/calendar-types"
import {
  CALENDAR_START_HOUR,
  CALENDAR_END_HOUR,
  SLOT_HEIGHT_PX,
  SLOT_MINUTES,
  TOTAL_SLOTS,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "@/lib/calendar-types"
import { id } from "@instantdb/react"
import { db } from "@/lib/db"
import { DayColumn } from "@/components/calendar/DayColumn"
import { AddTaskModal } from "@/components/calendar/AddTaskModal"

type Meeting = {
  id: string
  title: string
  description?: string
  category: TaskCategory
  date: string
  time?: string
  duration?: number
  createdAt?: string
}

function toDateStr(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

// Time gutter labels: show full hour labels only
const TIME_LABELS: string[] = []
for (let h = CALENDAR_START_HOUR; h <= 17; h++) {
  TIME_LABELS.push(h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`)
}

function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = CALENDAR_START_HOUR; h < CALENDAR_END_HOUR; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`)
    slots.push(`${String(h).padStart(2, "0")}:30`)
  }
  slots.push(`${String(CALENDAR_END_HOUR).padStart(2, "0")}:00`)
  return slots
}

export function AdminCalendar() {
  const today = useMemo(() => startOfDay(new Date()), [])
  const now = useMemo(() => new Date(), [])
  const maxBookingDate = useMemo(() => addDays(today, 14), [today])
  const minBookingDateTime = useMemo(() => addHours(now, 2), [now])
  const currentWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today])

  // Calculate the valid week range (3 weeks total)
  const minWeekStart = currentWeekStart
  const maxWeekStart = addWeeks(currentWeekStart, 2)

  const [weekStart, setWeekStart] = useState(() => currentWeekStart)
  const [modalConfig, setModalConfig] = useState<{ date: string; time?: string } | null>(null)
  const [editing, setEditing] = useState<Meeting | null>(null)
  const draggingId = useRef<string | null>(null)
  const dragOffsetY = useRef<number>(0)

  const { isLoading, error, data } = db.useQuery({ meetings: {} })
  const meetings = ((data?.meetings ?? []) as Meeting[]) ?? []

  const weekEndDate = addDays(weekStart, 6)
  const weekLabel = `${format(weekStart, "MMM d")} – ${format(weekEndDate, "MMM d, yyyy")}`

  const canGoPrev = isAfter(weekStart, minWeekStart) || toDateStr(weekStart) !== toDateStr(minWeekStart)
  const canGoNext = isBefore(weekStart, maxWeekStart)

  const isSlotBookable = (date: Date, time: string) => {
    const [h, m] = time.split(":").map(Number)
    const slotDateTime = new Date(date)
    slotDateTime.setHours(h, m, 0, 0)

    if (isBefore(slotDateTime, minBookingDateTime)) return false
    if (isAfter(startOfDay(date), maxBookingDate)) return false
    return true
  }

  const doesConflict = (dateStr: string, time: string, movingId: string) => {
    const moving = meetings.find((m) => m.id === movingId)
    if (!moving) return false

    const [newH, newM] = time.split(":").map(Number)
    const newStart = newH * 60 + newM
    const newDuration = moving.duration ?? 30
    const newEnd = newStart + newDuration

    // Disallow any meeting that would end after 17:00
    const dayEndMinutes = CALENDAR_END_HOUR * 60
    if (newEnd > dayEndMinutes) return true

    return meetings.some((m) => {
      if (m.id === movingId) return false
      if (m.date !== dateStr || !m.time) return false

      const [h, mm] = m.time.split(":").map(Number)
      const existingStart = h * 60 + mm
      const existingDuration = m.duration ?? 30
      const existingEnd = existingStart + existingDuration

      // intervals overlap?
      return existingStart < newEnd && newStart < existingEnd
    })
  }

  const canBookSlotForDay = (dayDate: Date) => (time: string) => {
    // First apply global booking window rules
    if (!isSlotBookable(dayDate, time)) return false
    // If we are not currently dragging anything, just use booking rules
    if (!draggingId.current) return true
    const dateStr = toDateStr(dayDate)
    // When dragging, also prevent dropping onto conflicting times
    return !doesConflict(dateStr, time, draggingId.current)
  }

  const findNextAvailableSlot = (): { dateStr: string; time: string } | null => {
    const slots = generateTimeSlots()
    const startDate = now

    // iterate day by day within booking window
    for (
      let d = new Date(startDate);
      !isAfter(startOfDay(d), maxBookingDate);
      d = addDays(d, 1)
    ) {
      const dateStr = toDateStr(d)
      for (const time of slots) {
        if (!isSlotBookable(d, time)) continue
        if (doesConflict(dateStr, time, "")) continue
        return { dateStr, time }
      }
    }
    return null
  }

  const handleDragStart = (e: React.DragEvent, meetingId: string) => {
    draggingId.current = meetingId
    e.dataTransfer.effectAllowed = "move"
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragOffsetY.current = e.clientY - rect.top
  }

  const handleDrop = (e: React.DragEvent, targetDate: string, gridTop: number) => {
    e.preventDefault()
    if (!draggingId.current) return

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

    if (draggingId.current && doesConflict(targetDate, newTime, draggingId.current)) {
      // prevent dropping onto a time that already has another meeting
      draggingId.current = null
      return
    }

    db.transact(
      db.tx.meetings[draggingId.current].update({
        date: targetDate,
        time: newTime,
      })
    ).catch((err: any) => {
      console.error("InstantDB error (admin drag)", err)
      alert(err?.body?.message ?? err?.message ?? "Could not move the meeting.")
    })

    draggingId.current = null
  }

  const handleDelete = (meetingId: string) => {
    db.transact(db.tx.meetings[meetingId].delete()).catch((err: any) => {
      console.error("InstantDB error (admin delete)", err)
      alert(err?.body?.message ?? err?.message ?? "Could not delete the meeting.")
    })
  }

  const handleAddMeeting = (payload: {
    title: string
    description?: string
    category: TaskCategory
    date: string
    time?: string
    duration?: number
    email?: string
  }) => {
    if (editing) {
      db.transact([
        (db.tx.meetings as any)[editing.id].update({
          title: payload.title,
          description: payload.description,
          category: payload.category,
          date: payload.date,
          time: payload.time,
          duration: payload.duration,
          userEmail: payload.email,
        }),
      ])
        .then(() => {
          setModalConfig(null)
          setEditing(null)
        })
        .catch((err: any) => {
          console.error("InstantDB error (admin edit)", err)
          alert(err?.body?.message ?? err?.message ?? "Could not update the meeting.")
        })
    } else {
      const meetingId = id()
      db.transact([
        // use any to avoid over-strict Instant generic typing here
        (db.tx.meetings as any)[meetingId].create({
          title: payload.title,
          description: payload.description,
          category: payload.category,
          date: payload.date,
          time: payload.time,
          duration: payload.duration,
          userEmail: payload.email,
        }),
      ]).catch((err: any) => {
        console.error("InstantDB error (admin create)", err)
        alert(err?.body?.message ?? err?.message ?? "Could not save the meeting.")
      })
    }
  }

  if (isLoading) return null
  if (error) {
    return <div className="p-4 text-red-500">Error: {error.message}</div>
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: "url('/images/bg-green-gradient.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
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
              onClick={() => {
                if (canGoPrev) setWeekStart((w) => subWeeks(w, 1))
              }}
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
              onClick={() => {
                if (canGoNext) setWeekStart((w) => addWeeks(w, 1))
              }}
              disabled={!canGoNext}
              className="p-2 rounded-xl transition-all duration-200 hover:bg-white/40 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              style={{ border: "1px solid rgba(0,0,0,0.1)" }}
              aria-label="Next week"
            >
              <ChevronRight className="w-4 h-4 text-slate-700" />
            </button>
            <button
              onClick={() => {
                const next = findNextAvailableSlot()
                if (next) {
                  setModalConfig({ date: next.dateStr, time: next.time })
                } else {
                  setModalConfig({ date: toDateStr(addDays(weekStart, 0)) })
                }
              }}
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

      <main className="relative z-10 flex-1 px-6 pb-4 overflow-auto">
        <div className="flex items-center gap-5 mb-3 px-1">
          {(Object.keys(CATEGORY_LABELS) as TaskCategory[]).map((cat) => {
            const label = CATEGORY_LABELS[cat]
            const colors = CATEGORY_COLORS[cat]
            return (
              <div key={cat} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: colors.dot,
                  }}
                />
                <span className="text-slate-600 text-[11px] font-sans">{label}</span>
              </div>
            )
          })}
          <span className="ml-auto flex items-center gap-2 text-slate-400 text-[11px] font-sans">
            <span>Drag meetings between days · Click a slot to add</span>
            <span className="flex items-center gap-1">
              <Ban className="w-3 h-3" />
              <span>Drop on occupied time disabled</span>
            </span>
          </span>
        </div>

        <div className="flex gap-0">
          {/* Drag-left zone to go to previous week */}
          <div
            className="flex-shrink-0 pt-[52px]"
            style={{ width: 16 }}
            onDragEnter={(e) => {
              e.preventDefault()
              if (canGoPrev) {
                setWeekStart((w) => subWeeks(w, 1))
              }
            }}
          />

          <div className="flex-shrink-0 pr-2 pt-[52px]" style={{ width: 44 }}>
            {TIME_LABELS.map((label, i) => (
              <div key={label} className="flex items-start justify-end" style={{ height: i < TIME_LABELS.length - 1 ? SLOT_HEIGHT_PX * 2 : 0 }}>
                <span className="text-slate-500 text-[10px] font-sans -translate-y-2 leading-none">{label}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 flex-1 min-w-0">
            {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
              const dayDate = addDays(weekStart, dayOffset)
              const dateStr = toDateStr(dayDate)
              const isWeekend = dayOffset >= 5
              const isBeforeToday = isBefore(dayDate, today)
              const isAfterBookingWindow = isAfter(startOfDay(dayDate), maxBookingDate)
              const isLocked = isBeforeToday || isAfterBookingWindow
              return (
                <div key={dayOffset} style={{ flex: isWeekend ? "0 0 36px" : "1 1 0" }}>
                  <DayColumn
                    date={dayDate}
                    dateStr={dateStr}
                    tasks={meetings.filter((m) => m.date === dateStr) as any}
                    isWeekend={isWeekend}
                    isLocked={isLocked}
                    canBookSlot={canBookSlotForDay(dayDate)}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    onDelete={handleDelete}
                    onAddTask={(date, time) => setModalConfig({ date, time })}
                    onWeekendHover={
                      isWeekend && canGoNext
                        ? () => {
                            if (canGoNext) setWeekStart((w) => addWeeks(w, 1))
                          }
                        : undefined
                    }
                    onClickTask={(task) => {
                      setEditing(task as any)
                      setModalConfig({ date: task.date, time: task.time })
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {modalConfig !== null && (
        <AddTaskModal
          defaultDate={modalConfig.date}
          defaultTime={modalConfig.time}
          existingTasks={meetings as any}
          initialTitle={editing?.title}
          initialDescription={editing?.description}
          initialCategory={editing?.category}
          initialEmail={editing?.userEmail}
          showEmailField
          onClose={() => {
            setModalConfig(null)
            setEditing(null)
          }}
          onAdd={handleAddMeeting}
        />
      )}

      {/* Bottom bar with logout */}
      <footer className="px-6 pb-6 flex justify-end">
        <button
          onClick={() => {
            db.auth.signOut().catch((err: any) => {
              console.error("InstantDB error (admin sign out)", err)
              alert(err?.body?.message ?? err?.message ?? "Could not sign out.")
            })
          }}
          className="px-4 py-2 rounded-xl text-sm font-semibold font-sans text-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
          style={{
            backgroundColor: "#0C115B",
            boxShadow: "0 4px 16px rgba(12,17,91,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
            border: "1px solid rgba(12,17,91,0.6)",
          }}
        >
          Log out
        </button>
      </footer>
    </div>
  )
}

