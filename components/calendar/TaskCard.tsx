"use client"

import { GripVertical, X, Clock } from "lucide-react"
import type { Task } from "@/lib/calendar-types"
import { CATEGORY_COLORS } from "@/lib/calendar-types"

interface TaskCardProps {
  task: Task
  height?: number
  onDragStart: (e: React.DragEvent, taskId: string) => void
  onDelete: (taskId: string) => void
  isLocked?: boolean
}

export function TaskCard({ task, height, onDragStart, onDelete, isLocked = false }: TaskCardProps) {
  const colors = CATEGORY_COLORS[task.category]

  return (
    <div
      draggable={!isLocked}
      onDragStart={isLocked ? undefined : (e) => onDragStart(e, task.id)}
      className={`group relative rounded-lg px-2 py-1.5 select-none transition-all duration-200 w-full overflow-hidden ${
        isLocked ? "cursor-default opacity-70" : "cursor-grab active:cursor-grabbing hover:brightness-110"
      }`}
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        backdropFilter: "blur(12px)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.4)",
        height: height ? `${height}px` : undefined,
      }}
    >
      {/* Drag handle */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 transition-opacity">
        <GripVertical className="w-3 h-3 text-slate-600" />
      </div>

      {/* Delete button (hidden for locked meetings) */}
      {!isLocked && (
        <button
          onClick={() => onDelete(task.id)}
          className="absolute right-1 top-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-black/10"
          aria-label="Delete meeting"
        >
          <X className="w-2.5 h-2.5 text-slate-600" />
        </button>
      )}

      <div className="pl-3 pr-3">
        <div className="flex items-center gap-1 mb-0.5">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors.dot }}
          />
          <p className="text-slate-700 text-[11px] font-semibold leading-snug line-clamp-2 font-sans">
            {task.title}
          </p>
        </div>

        {task.time && (
          <div className="flex items-center gap-1">
            <Clock className="w-2 h-2 text-slate-400 flex-shrink-0" />
            <span className="text-slate-500 text-[9px] font-sans">{task.time}</span>
          </div>
        )}
      </div>
    </div>
  )
}
