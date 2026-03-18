"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { GripVertical, X, Clock } from "lucide-react"
import type { Task } from "@/lib/calendar-types"
import { CATEGORY_COLORS } from "@/lib/calendar-types"

interface TaskCardProps {
  task: Task
  height?: number
  onDragStart: (e: React.DragEvent, taskId: string) => void
  onDelete: (taskId: string) => void
  isLocked?: boolean
  onClickTask?: (task: Task) => void
}

export function TaskCard({ task, height, onDragStart, onDelete, isLocked = false, onClickTask }: TaskCardProps) {
  const colors = CATEGORY_COLORS[task.category]
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const [hasWindow, setHasWindow] = useState(false)

  useEffect(() => {
    setHasWindow(true)
  }, [])

  useLayoutEffect(() => {
    if (!confirmingDelete) return
    if (!deleteButtonRef.current) return

    const update = () => {
      const rect = deleteButtonRef.current!.getBoundingClientRect()
      // Place tooltip slightly left of the X, aligned to top.
      const top = Math.max(8, rect.top - 2)
      const left = Math.max(8, rect.left - 200) // ~tooltip width
      setTooltipPos({ top, left })
    }

    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [confirmingDelete])

  useEffect(() => {
    if (!confirmingDelete) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return

      // If click is inside tooltip or delete button, ignore.
      if (tooltipRef.current?.contains(target)) return
      if (deleteButtonRef.current?.contains(target)) return

      setConfirmingDelete(false)
    }

    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [confirmingDelete])

  return (
    <div
      draggable={!isLocked}
      onDragStart={isLocked ? undefined : (e) => onDragStart(e, task.id)}
      onClick={
        onClickTask
          ? () => {
              if (confirmingDelete) return
              onClickTask(task)
            }
          : undefined
      }
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
          ref={deleteButtonRef}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setConfirmingDelete(true)
          }}
          className="absolute right-1 top-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-black/10"
          aria-label="Delete meeting"
        >
          <X className="w-2.5 h-2.5 text-slate-600" />
        </button>
      )}

      {!isLocked && confirmingDelete && (
        hasWindow &&
        tooltipPos &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[9999]"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            role="tooltip"
            aria-label="Delete confirmation"
          >
            <div
              className="rounded-lg px-2 py-2 shadow-lg"
              style={{
                background: "rgba(255,255,255,0.95)",
                border: "1px solid rgba(0,0,0,0.12)",
                backdropFilter: "blur(12px)",
                minWidth: 190,
              }}
            >
              <p className="text-[11px] text-slate-700 font-sans font-semibold leading-snug">
                Are you sure you want to delete this meeting?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-md py-1 text-[11px] font-semibold font-sans"
                  style={{ background: "rgba(12,17,91,0.12)", border: "1px solid rgba(12,17,91,0.35)", color: "#0C115B" }}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setConfirmingDelete(false)
                  }}
                >
                  No
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-md py-1 text-[11px] font-semibold font-sans"
                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#b91c1c" }}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setConfirmingDelete(false)
                    onDelete(task.id)
                  }}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
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
