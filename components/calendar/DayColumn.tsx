"use client"

import { useState, useRef } from "react"
import { format, isToday } from "date-fns"
import type { Task } from "@/lib/calendar-types"
import {
  CALENDAR_START_HOUR,
  SLOT_MINUTES,
  TOTAL_SLOTS,
  SLOT_HEIGHT_PX,
} from "@/lib/calendar-types"
import { TaskCard } from "./TaskCard"

interface DayColumnProps {
  date: Date
  dateStr: string
  tasks: Task[]
  isWeekend: boolean
  isLocked: boolean
  canBookSlot?: (time: string) => boolean
  onDragStart: (e: React.DragEvent, taskId: string) => void
  onDrop: (e: React.DragEvent, dateStr: string, gridTop: number) => void
  onDelete: (taskId: string) => void
  onAddTask: (dateStr: string, time?: string) => void
  onWeekendHover?: () => void
  onClickTask?: (task: Task) => void
}

function slotToTime(slot: number): string {
  const totalMinutes = CALENDAR_START_HOUR * 60 + slot * SLOT_MINUTES
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function timeToTopPx(time: string): number {
  const [h, m] = time.split(":").map(Number)
  const minutesFromStart = (h - CALENDAR_START_HOUR) * 60 + m
  const slot = minutesFromStart / SLOT_MINUTES
  return Math.max(0, slot * SLOT_HEIGHT_PX)
}

function durationToHeightPx(durationMinutes: number): number {
  return (durationMinutes / SLOT_MINUTES) * SLOT_HEIGHT_PX
}

export function DayColumn({
  date,
  dateStr,
  tasks,
  isWeekend,
  isLocked,
  canBookSlot,
  onDragStart,
  onDrop,
  onDelete,
  onAddTask,
  onWeekendHover,
  onClickTask,
}: DayColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const dayName = format(date, "EEE")
  const dayNum = format(date, "d")
  const today = isToday(date)

  // Weekend: collapsed, no-task mini column
  if (isWeekend) {
    return (
      <div
        className="flex flex-col min-w-0"
        style={{ width: "100%" }}
        onDragEnter={(e) => {
          e.preventDefault()
          if (onWeekendHover) {
            onWeekendHover()
          }
        }}
      >
        <div
          className="py-2 px-2 rounded-xl text-center"
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(10px)",
          }}
        >
          <p className="text-slate-400 text-[9px] font-semibold uppercase tracking-widest font-sans">{dayName}</p>
          <p className="text-slate-400 text-sm font-bold font-sans leading-tight">{dayNum}</p>
        </div>
        <div
          className="flex-1 mt-2 rounded-xl flex items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px dashed rgba(0,0,0,0.1)",
            minHeight: TOTAL_SLOTS * SLOT_HEIGHT_PX,
          }}
        >
          <span
            className="text-slate-300 text-[9px] font-sans"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Weekend
          </span>
        </div>
      </div>
    )
  }

  const timedTasks = tasks.filter((t) => t.time)
  const untimedTasks = tasks.filter((t) => !t.time)

  return (
    <div className={`flex flex-col min-w-0 flex-1 ${isLocked ? "opacity-60" : ""}`}>
      {/* Day header */}
      <div
        className="mb-2 py-2 px-3 rounded-xl text-center flex-shrink-0"
        style={{
          background: today
            ? "rgba(12,17,91,0.55)"
            : isLocked
            ? "rgba(255,255,255,0.16)"
            : "rgba(255,255,255,0.28)",
          backdropFilter: "blur(20px)",
          border: today
            ? "1px solid rgba(12,17,91,0.6)"
            : isLocked
            ? "1px solid rgba(255,255,255,0.35)"
            : "1px solid rgba(255,255,255,0.45)",
          boxShadow: today
            ? "0 4px 16px rgba(12,17,91,0.2), inset 0 1px 0 rgba(255,255,255,0.3)"
            : isLocked
            ? "0 2px 8px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.4)"
            : "0 4px 12px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      >
        <p
          className={`text-[10px] font-semibold uppercase tracking-widest font-sans ${
            today ? "text-white/70" : isLocked ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {dayName}
        </p>
        <p
          className={`text-lg font-bold font-sans leading-tight ${
            today ? "text-white" : isLocked ? "text-slate-500" : "text-slate-700"
          }`}
        >
          {dayNum}
        </p>
      </div>

      {/* Timed grid drop zone */}
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
        className="relative rounded-xl overflow-hidden transition-all duration-200"
        style={{
          height: TOTAL_SLOTS * SLOT_HEIGHT_PX,
          background: isDragOver ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.18)",
          border: isDragOver ? "1.5px dashed rgba(12,17,91,0.4)" : "1px solid rgba(255,255,255,0.45)",
          backdropFilter: "blur(12px)",
          boxShadow: isDragOver
            ? "0 0 20px rgba(12,17,91,0.08), inset 0 1px 0 rgba(255,255,255,0.5)"
            : "inset 0 1px 0 rgba(255,255,255,0.4)",
        }}
      >
        {/* Hour/half-hour slot lines */}
        {Array.from({ length: TOTAL_SLOTS }).map((_, slot) => {
          const isHour = slot % 2 === 0
          const time = slotToTime(slot)
          const isBookable = !isLocked && (canBookSlot ? canBookSlot(time) : true)
          return (
            <div
              key={slot}
              className={`absolute left-0 right-0 group/slot ${
                isBookable ? "cursor-pointer" : "cursor-not-allowed"
              }`}
              style={{ top: slot * SLOT_HEIGHT_PX, height: SLOT_HEIGHT_PX }}
              onClick={
                isBookable
                  ? () => {
                      onAddTask(dateStr, time)
                    }
                  : undefined
              }
            >
              <div
                className="absolute left-0 right-0 top-0 pointer-events-none"
                style={{
                  borderTop: isHour
                    ? "1px solid rgba(0,0,0,0.1)"
                    : "1px dashed rgba(0,0,0,0.05)",
                }}
              />
              {/* Hover hint */}
              <div className="absolute inset-0 opacity-0 group-hover/slot:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-slate-400 text-[9px] font-sans">+ {slotToTime(slot)}</span>
              </div>
            </div>
          )
        })}

        {/* Positioned tasks */}
        {timedTasks.map((task) => {
          const top = timeToTopPx(task.time!)
          const height = Math.max(SLOT_HEIGHT_PX, durationToHeightPx(task.duration ?? 30))
          return (
            <div
              key={task.id}
              className="absolute left-1 right-1"
              style={{ top, height, zIndex: 10 }}
            >
              <TaskCard
                task={task}
                height={height}
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
