"use client"

import { useState, useRef } from "react"
import { format, isToday } from "date-fns"
import { pl } from "date-fns/locale"
import { Plus, ChevronLeft } from "lucide-react"
import type { Task } from "@/lib/calendar-types"
import {
  CALENDAR_START_HOUR,
  CALENDAR_END_HOUR,
  PX_PER_MINUTE,
  GRID_TOTAL_HEIGHT,
  SESSION_DURATION,
} from "@/lib/calendar-types"
import { snapTimeToFullHour } from "@/lib/time-options"
import { TaskCard } from "./TaskCard"

interface DayColumnProps {
  date: Date
  dateStr: string
  tasks: Task[]
  isWeekend: boolean
  isLocked: boolean
  /** Day is administratively blocked — guests can't book, admin sees a badge. */
  isBlocked?: boolean
  /** Individual slot times that are blocked on this specific date. */
  blockedTimes?: Set<string>
  /** Configured slot times for this specific day (passed from AdminCalendar). */
  scheduledSlots?: string[]
  canBookSlot?: (time: string) => boolean
  onDragStart: (e: React.DragEvent, taskId: string) => void
  onDrop: (e: React.DragEvent, dateStr: string, gridTop: number) => void
  onDelete: (taskId: string) => void
  onAddTask: (dateStr: string, time?: string) => void
  onWeekendHover?: () => void
  onClickTask?: (task: Task) => void
  /** Admin-only: Saturday column with free-form booking (no schedule slots). */
  saturdayAdminMode?: boolean
  /** Collapsed Saturday strip with expand control (admin). */
  saturdayCollapsed?: boolean
  onSaturdayExpand?: () => void
  onSaturdayCollapse?: () => void
}

/** Convert "HH:MM" to pixel offset from the top of the grid. */
function timeToPx(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return ((h - CALENDAR_START_HOUR) * 60 + m) * PX_PER_MINUTE
}

/** Full hour ticks drawn as grid lines (8, 9, 10 … 20). */
const GRID_HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
  (_, i) => CALENDAR_START_HOUR + i,
)

export function DayColumn({
  date,
  dateStr,
  tasks,
  isWeekend,
  isLocked,
  isBlocked,
  blockedTimes,
  scheduledSlots: scheduledSlotsProp,
  canBookSlot,
  onDragStart,
  onDrop,
  onDelete,
  onAddTask,
  onWeekendHover,
  onClickTask,
  saturdayAdminMode = false,
  saturdayCollapsed = false,
  onSaturdayExpand,
  onSaturdayCollapse,
}: DayColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const dayName = format(date, "EEE", { locale: pl })
  const dayNum = format(date, "d")
  const today = isToday(date)

  const scheduledSlots = scheduledSlotsProp ?? []

  // Weekend: collapsed mini column
  if (isWeekend) {
    return (
      <div
        className="flex flex-col min-w-0"
        style={{ width: "100%" }}
        onDragEnter={(e) => {
          e.preventDefault()
          if (onWeekendHover) onWeekendHover()
        }}
      >
        <div
          className="py-1 px-0.5 sm:py-2 sm:px-2 rounded-md sm:rounded-xl text-center"
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(10px)",
          }}
        >
          <p className="text-slate-600 text-[7px] sm:text-[9px] font-semibold uppercase tracking-wide sm:tracking-widest font-sans leading-none">
            <span className="sm:hidden">{dayName.charAt(0)}</span>
            <span className="hidden sm:inline">{dayName}</span>
          </p>
          <p className="text-slate-600 text-[10px] sm:text-sm font-bold font-sans leading-tight">{dayNum}</p>
        </div>
        <div
          className="flex-1 mt-1 sm:mt-2 rounded-md sm:rounded-xl flex items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px dashed rgba(0,0,0,0.1)",
            minHeight: GRID_TOTAL_HEIGHT,
          }}
        >
          <span
            className="hidden sm:inline text-slate-800 text-[9px] font-sans"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Weekend
          </span>
        </div>
      </div>
    )
  }

  // Saturday (admin): collapsed strip with + to expand
  if (saturdayAdminMode && saturdayCollapsed) {
    const meetingCount = tasks.filter((t) => t.time).length
    return (
      <div className="flex flex-col min-w-0" style={{ width: "100%" }}>
        <div
          className="py-1 px-0.5 sm:py-2 sm:px-2 rounded-md sm:rounded-xl text-center"
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(10px)",
          }}
        >
          <p className="text-slate-600 text-[7px] sm:text-[9px] font-semibold uppercase tracking-wide sm:tracking-widest font-sans leading-none">
            <span className="sm:hidden">{dayName.charAt(0)}</span>
            <span className="hidden sm:inline">{dayName}</span>
          </p>
          <p className="text-slate-600 text-[10px] sm:text-sm font-bold font-sans leading-tight">{dayNum}</p>
        </div>
        <div
          className="flex-1 mt-1 sm:mt-2 rounded-md sm:rounded-xl flex flex-col items-center justify-center gap-1"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px dashed rgba(0,0,0,0.1)",
            minHeight: GRID_TOTAL_HEIGHT,
          }}
        >
          {meetingCount > 0 && (
            <span className="text-[9px] font-semibold font-sans text-slate-600 tabular-nums">
              {meetingCount}
            </span>
          )}
          <button
            type="button"
            onClick={onSaturdayExpand}
            className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-lg transition-all hover:bg-white/40 hover:-translate-y-0.5 active:translate-y-0"
            style={{
              background: "rgba(12,17,91,0.12)",
              border: "1px solid rgba(12,17,91,0.2)",
              color: "#0C115B",
            }}
            aria-label="Rozwiń sobotę"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>
    )
  }

  const timedTasks = tasks.filter((t) => t.time)
  const untimedTasks = tasks.filter((t) => !t.time)

  // Slots with no existing booking → rendered as "Available" ghost blocks
  const bookedTimes = new Set(timedTasks.map((t) => t.time))
  const availableSlots = saturdayAdminMode
    ? []
    : scheduledSlots.filter((slot) => !bookedTimes.has(slot))

  const handleSaturdayGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!saturdayAdminMode || isLocked) return
    if ((e.target as HTMLElement).closest("[data-task-card]")) return

    const gridTop = gridRef.current?.getBoundingClientRect().top ?? 0
    const relativeY = e.clientY - gridTop
    const minutesFromStart = relativeY / PX_PER_MINUTE
    const absoluteMinutes = CALENDAR_START_HOUR * 60 + minutesFromStart
    const h = Math.floor(absoluteMinutes / 60)
    const m = absoluteMinutes % 60
    const clickedTime = snapTimeToFullHour(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    )
    onAddTask(dateStr, clickedTime)
  }

  return (
    <div className={`flex flex-col min-w-0 flex-1 ${isLocked ? "opacity-60" : ""}`}>
      {/* Day header */}
      <div
        className="mb-1 sm:mb-2 py-1.5 px-1.5 sm:py-2 sm:px-3 rounded-lg sm:rounded-xl text-center flex-shrink-0 relative"
        style={{
          background: isBlocked
            ? "rgba(254,226,226,0.25)"
            : today
            ? "rgba(12,17,91,0.55)"
            : isLocked
            ? "rgba(255,255,255,0.16)"
            : "rgba(255,255,255,0.28)",
          backdropFilter: "blur(20px)",
          border: isBlocked
            ? "1.5px dashed rgba(239,68,68,0.3)"
            : today
            ? "1px solid rgba(12,17,91,0.6)"
            : isLocked
            ? "1px solid rgba(255,255,255,0.35)"
            : "1px solid rgba(255,255,255,0.45)",
          boxShadow: today && !isBlocked
            ? "0 4px 16px rgba(12,17,91,0.2), inset 0 1px 0 rgba(255,255,255,0.3)"
            : isLocked
            ? "0 2px 8px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.4)"
            : "0 4px 12px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      >
        <p
          className={`text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide sm:tracking-widest font-sans ${
            isBlocked ? "text-rose-400" : today ? "text-white/70" : isLocked ? "text-slate-400" : "text-slate-700"
          }`}
        >
          {dayName}
        </p>
        <p
          className={`text-sm sm:text-lg font-bold font-sans leading-tight ${
            isBlocked ? "text-rose-600" : today ? "text-white" : isLocked ? "text-slate-500" : "text-slate-700"
          }`}
        >
          {dayNum}
        </p>
        {saturdayAdminMode && onSaturdayCollapse && (
          <button
            type="button"
            onClick={onSaturdayCollapse}
            className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 flex items-center justify-center w-5 h-5 rounded-md transition-all hover:bg-white/40"
            style={{ color: today ? "rgba(255,255,255,0.8)" : "#64748b" }}
            aria-label="Zwiń sobotę"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Time-based slot grid */}
      <div
        ref={gridRef}
        onDragOver={
          isLocked
            ? undefined
            : (e) => {
                e.preventDefault()
                setIsDragOver(true)
              }
        }
        onDragLeave={isLocked ? undefined : () => setIsDragOver(false)}
        onDrop={
          isLocked
            ? undefined
            : (e) => {
                setIsDragOver(false)
                const gridTop = gridRef.current?.getBoundingClientRect().top ?? 0
                onDrop(e, dateStr, gridTop)
              }
        }
        onClick={saturdayAdminMode && !isLocked ? handleSaturdayGridClick : undefined}
        className={`relative rounded-lg sm:rounded-xl overflow-hidden transition-all duration-200 ${
          saturdayAdminMode && !isLocked ? "cursor-pointer" : ""
        }`}
        style={{
          height: GRID_TOTAL_HEIGHT,
          background: isDragOver ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.18)",
          border: isDragOver ? "1.5px dashed rgba(12,17,91,0.4)" : "1px solid rgba(255,255,255,0.45)",
          backdropFilter: "blur(12px)",
          boxShadow: isDragOver
            ? "0 0 20px rgba(12,17,91,0.08), inset 0 1px 0 rgba(255,255,255,0.5)"
            : "inset 0 1px 0 rgba(255,255,255,0.4)",
        }}
      >
        {/* Full-hour grid lines */}
        {GRID_HOURS.map((hour) => (
          <div
            key={hour}
            className="absolute left-0 right-0 pointer-events-none"
            style={{
              top: (hour - CALENDAR_START_HOUR) * 60 * PX_PER_MINUTE,
              borderTop: hour === CALENDAR_START_HOUR
                ? "none"
                : "1px solid rgba(0,0,0,0.1)",
            }}
          />
        ))}

        {/* Available slot ghost blocks */}
        {availableSlots.map((slotTime) => {
          const slotBlocked = isBlocked || (blockedTimes?.has(slotTime) ?? false)
          const isBookable = !isLocked && !slotBlocked && (canBookSlot ? canBookSlot(slotTime) : true)
          const topPx = timeToPx(slotTime)
          const slotHeight = SESSION_DURATION * PX_PER_MINUTE - 2

          return (
            <div
              key={slotTime}
              className={`absolute left-0.5 right-0.5 sm:left-1 sm:right-1 group/avail ${isBookable ? "cursor-pointer" : ""}`}
              style={{ top: topPx, height: slotHeight, zIndex: 1 }}
              onClick={isBookable ? () => onAddTask(dateStr, slotTime) : undefined}
            >
              <div
                className="h-full rounded-md sm:rounded-lg px-1 py-1 sm:px-2 sm:py-1.5 flex flex-col justify-center transition-colors duration-150 group-hover/avail:bg-white/50"
                style={{
                  border: slotBlocked
                    ? "1.5px dashed rgba(239,68,68,0.3)"
                    : isBookable
                    ? "1.5px dashed rgba(0,0,0,0.14)"
                    : "1.5px dashed rgba(0,0,0,0.07)",
                  background: slotBlocked
                    ? "rgba(254,226,226,0.25)"
                    : isBookable
                    ? "rgba(255,255,255,0.28)"
                    : "rgba(0,0,0,0.02)",
                }}
              >
                <span
                  className="text-[9px] sm:text-[10px] font-semibold font-sans leading-tight"
                  style={{ color: slotBlocked ? "#b91c1c" : undefined }}
                >
                  {slotTime}
                </span>
                <span
                  className="hidden sm:inline text-[9px] font-sans"
                  style={{ color: slotBlocked ? "#ef4444" : undefined }}
                >
                  {slotBlocked ? "niedostępny" : "dostępny"}
                </span>
              </div>
              {isBookable && (
                <div
                  className="absolute inset-0 rounded-lg opacity-0 group-hover/avail:opacity-100 transition-opacity pointer-events-none"
                  style={{ border: "1.5px dashed rgba(12,17,91,0.28)" }}
                />
              )}
            </div>
          )
        })}

        {/* Positioned meeting cards */}
        {timedTasks.map((task) => {
          const topPx = timeToPx(task.time!)
          const taskHeight = ((task as any).duration ?? SESSION_DURATION) * PX_PER_MINUTE - 2
          return (
            <div
              key={task.id}
              className="absolute left-0.5 right-0.5 sm:left-1 sm:right-1"
              style={{ top: topPx, height: taskHeight, zIndex: 10 }}
              data-task-card
            >
              <TaskCard
                task={task}
                height={taskHeight}
                onDragStart={onDragStart}
                onDelete={onDelete}
                isLocked={isLocked}
                onClickTask={onClickTask}
              />
            </div>
          )
        })}
      </div>

      {/* Untimed tasks below the grid */}
      {untimedTasks.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {untimedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onDragStart={onDragStart}
              onDelete={onDelete}
              isLocked={isLocked}
              onClickTask={onClickTask}
            />
          ))}
        </div>
      )}
    </div>
  )
}
