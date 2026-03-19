"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { id } from "@instantdb/react"
import { db } from "@/lib/db"
import type { TaskCategory } from "@/lib/calendar-types"
import { CATEGORY_LABELS } from "@/lib/calendar-types"
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
  userId?: string
  userEmail?: string
  createdBy?: "admin" | "guest" | string
  status?: "confirmed" | "not_confirmed" | string
  previousDate?: string
  previousTime?: string
  previousDuration?: number
  changeRequestedAt?: string
}

function toDateTime(m: Meeting): number {
  const [year, month, day] = m.date.split("-").map(Number)
  const [h, min] = (m.time ?? "00:00").split(":").map(Number)
  return new Date(year, month - 1, day, h, min).getTime()
}

export function GuestDashboard() {
  const user = db.useUser()
  const { isLoading, error, data } = db.useQuery({ meetings: {} })
  const allMeetings = (data?.meetings ?? []) as Meeting[]
  const myMeetings = allMeetings.filter((m) => m.userId === user?.id)
  const hasReachedLimit = myMeetings.length >= 3

  const sortedMeetings = useMemo(
    () => [...myMeetings].sort((a, b) => toDateTime(a) - toDateTime(b)),
    [myMeetings]
  )

  const [showForm, setShowForm] = useState(false)
  const [showThanks, setShowThanks] = useState(false)
  const [lastCreated, setLastCreated] = useState<Meeting | null>(null)
  const [editing, setEditing] = useState<Meeting | null>(null)

  const [hasWindow, setHasWindow] = useState(false)
  const [deletingMeeting, setDeletingMeeting] = useState<Meeting | null>(null)
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const deleteTooltipRef = useRef<HTMLDivElement | null>(null)
  const [deleteTooltipPos, setDeleteTooltipPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    setHasWindow(true)
  }, [])

  useLayoutEffect(() => {
    if (!deletingMeeting) return
    if (!deleteButtonRef.current) return

    const update = () => {
      const rect = deleteButtonRef.current!.getBoundingClientRect()
      const top = Math.max(8, rect.top - 2)
      const left = Math.max(8, rect.left - 200)
      setDeleteTooltipPos({ top, left })
    }

    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [deletingMeeting])

  useEffect(() => {
    if (!deletingMeeting) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return

      // Ignore clicks inside tooltip or the delete button itself.
      if (deleteTooltipRef.current?.contains(target)) return
      if (deleteButtonRef.current?.contains(target)) return

      setDeletingMeeting(null)
    }

    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [deletingMeeting])

  const handleConfirmDelete = (meeting: Meeting) => {
    setDeletingMeeting(null)

    const deletedAt = new Date().toISOString()
    const guestEmail = meeting.userEmail ?? user?.email

    // Trigger n8n so it can email admins +/or the guest.
    if (guestEmail) {
      fetch("/api/n8n/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "meeting.deleted",
          deletedBy: "user",
          meetingId: meeting.id,
          title: meeting.title,
          description: meeting.description,
          category: meeting.category,
          date: meeting.date,
          time: meeting.time,
          duration: meeting.duration,
          userEmail: guestEmail,
          deletedAt,
        }),
      }).catch(() => {})
    }

    db.transact(db.tx.meetings[meeting.id].delete()).catch((err: any) => {
      console.error("InstantDB error (guest delete)", err)
      alert(err?.body?.message ?? err?.message ?? "Could not delete your meeting.")
    })
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
      {/* Top bar */}
      <header className="px-4 py-3">
        <h1 className="text-slate-800 font-bold text-xl font-sans">
          Your meetings
        </h1>
      </header>

      {/* Grid of meetings */}
      <main className="flex-1 px-4 pb-4 overflow-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {sortedMeetings.map((m, idx) => (
            <div
              key={m.id}
              className="rounded-xl bg-white/70 border border-slate-200 shadow-sm p-4"
            >
              {idx === 0 && (
                <div className="text-xs text-emerald-700 font-semibold mb-1">
                  Your latest meeting
                </div>
              )}
              <div className="text-base font-semibold text-slate-800">
                {m.title}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {m.date} {m.time ? `· ${m.time}` : ""}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Category: {CATEGORY_LABELS[m.category] ?? m.category}
              </div>
              {m.duration && (
                <div className="mt-1 text-sm text-slate-500">
                  Duration: {m.duration} min
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold font-sans text-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
                  style={{
                    backgroundColor: "#0C115B",
                    boxShadow: "0 3px 10px rgba(12,17,91,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                    border: "1px solid rgba(12,17,91,0.6)",
                  }}
                  onClick={() => {
                    setEditing(m)
                    setShowForm(true)
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold font-sans text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors"
                  onClick={(e) => {
                    e.preventDefault()
                    deleteButtonRef.current = e.currentTarget
                    setDeletingMeeting(m)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {/* Last tile: add meeting */}
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                if (hasReachedLimit) return
                setEditing(null)
                setShowForm(true)
              }}
              disabled={hasReachedLimit}
              className="rounded-xl border border-dashed border-slate-300 text-slate-600 text-sm font-sans flex items-center justify-center py-6 bg-white/40 hover:bg-white/70 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add meeting
            </button>
            {hasReachedLimit && (
              <p className="text-[11px] text-slate-700 font-sans">
                You can schedule up to 3 meetings.
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Bottom bar with logout */}
      <footer className="px-4 pb-4 flex justify-end">
        <button
          onClick={() => {
            db.auth.signOut().catch((err: any) => {
              console.error("InstantDB error (guest sign out)", err)
              alert(err?.body?.message ?? err?.message ?? "Could not sign out.")
            })
          }}
          className="px-4 py-3 rounded-xl text-sm font-semibold font-sans text-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
          style={{
            backgroundColor: "#0C115B",
            boxShadow: "0 4px 16px rgba(12,17,91,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
            border: "1px solid rgba(12,17,91,0.6)",
          }}
        >
          Log out
        </button>
      </footer>
      {/* Add / edit meeting modal */}
      {showForm && (
        <AddTaskModal
          defaultDate={
            editing?.date ?? new Date().toLocaleDateString("sv-SE")
          }
          defaultTime={editing?.time}
          existingTasks={allMeetings as any}
          initialTitle={editing?.title}
          initialDescription={editing?.description}
          initialCategory={editing?.category}
          editingTaskId={editing?.id}
          onClose={() => setShowForm(false)}
          onAdd={(payload: {
            title: string
            description?: string
            category: TaskCategory
            date: string
            time?: string
            duration?: number
          }) => {
            if (editing) {
              // Update existing meeting
              const nowIso = new Date().toISOString()
              db.transact(
                db.tx.meetings[editing.id].update({
                  ...payload,
                  // User-confirmed edits should not keep the "waiting for confirmation" state.
                  // Admin will only need confirmation when *admin* requests a change.
                  status: "confirmed",
                  previousDate: null,
                  previousTime: null,
                  previousDuration: null,
                  changeRequestedAt: null,
                  lastEditedBy: "guest",
                  updatedAt: nowIso,
                })
              )
                .then(() => {
                  // Fire-and-forget n8n trigger (server proxy avoids CORS)
                  fetch("/api/n8n/meetings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      event: "meeting.edited",
                      editedBy: "user",
                      meetingId: editing.id,
                      ...payload,
                      userEmail: editing.userEmail ?? user?.email,
                      status: "confirmed",
                      previousDate: null,
                      previousTime: null,
                      previousDuration: null,
                      changeRequestedAt: null,
                      updatedAt: nowIso,
                    }),
                  }).catch(() => {})

                  setShowForm(false)
                  setEditing(null)
                })
                .catch((err: any) => {
                  console.error("InstantDB error (guest edit)", err)
                  alert(err?.body?.message ?? err?.message ?? "Could not update your meeting.")
                })
            } else {
              // Create new meeting
              if (myMeetings.length >= 3) {
                alert("You can only schedule up to 3 meetings.")
                setShowForm(false)
                return
              }
              const meetingId = id()
              const createdAt = new Date().toISOString()
              db.transact([
                (db.tx.meetings as any)[meetingId].create({
                  ...payload,
                  createdAt,
                  userId: user?.id,
                  userEmail: user?.email,
                  createdBy: "guest",
                  lastEditedBy: "guest",
                  status: "confirmed",
                }),
              ])
                .then(() => {
                  // Fire-and-forget n8n trigger (server proxy avoids CORS)
                  fetch("/api/n8n/meetings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      event: "meeting.created",
                      meetingId,
                      ...payload,
                      createdAt,
                      userId: user?.id,
                      userEmail: user?.email,
                    }),
                  }).catch(() => {})

                  setShowForm(false)
                  setLastCreated({
                    id: meetingId,
                    userId: user?.id,
                    userEmail: user?.email,
                    ...payload,
                  } as Meeting)
                  setShowThanks(true)
                })
                .catch((err: any) => {
                  console.error("InstantDB error (guest create)", err)
                  alert(err?.body?.message ?? err?.message ?? "Could not save your meeting.")
                })
            }
          }}
        />
      )}

      {/* Delete confirmation (custom, like calendar view) */}
      {hasWindow && deletingMeeting && deleteTooltipPos && (
        createPortal(
          <div
            ref={deleteTooltipRef}
            className="fixed z-[9999]"
            style={{ top: deleteTooltipPos.top, left: deleteTooltipPos.left }}
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
                  style={{
                    background: "rgba(12,17,91,0.12)",
                    border: "1px solid rgba(12,17,91,0.35)",
                    color: "#0C115B",
                  }}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setDeletingMeeting(null)
                  }}
                >
                  No
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-md py-1 text-[11px] font-semibold font-sans"
                  style={{
                    background: "rgba(239,68,68,0.12)",
                    border: "1px solid rgba(239,68,68,0.35)",
                    color: "#b91c1c",
                  }}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleConfirmDelete(deletingMeeting!)
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

      {/* Thank-you popup */}
      {showThanks && lastCreated && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: "rgba(0,0,0,0.2)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 shadow-2xl relative"
            style={{
              background: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(40px) saturate(200%)",
              border: "1px solid rgba(255,255,255,0.7)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.15), inset 0 2px 0 rgba(255,255,255,0.8)",
            }}
          >
            {/* Close cross */}
            <button
              onClick={() => setShowThanks(false)}
              className="absolute right-3 top-3 text-slate-500 text-xs hover:text-slate-700"
              aria-label="Close"
            >
              ✕
            </button>

            <h2 className="text-slate-800 text-lg font-bold font-sans">
              Meeting added
            </h2>
            <p className="mt-2 text-slate-600 text-sm font-sans">
              Your meeting has been scheduled.
            </p>

            <div className="mt-4 text-sm text-slate-700 space-y-1 font-sans">
              <div>
                <span className="font-semibold">Name:</span> {lastCreated.title}
              </div>
              <div>
                <span className="font-semibold">Date &amp; time:</span>{" "}
                {lastCreated.date} {lastCreated.time ? `· ${lastCreated.time}` : ""}
              </div>
              <div>
                <span className="font-semibold">Category:</span>{" "}
                {CATEGORY_LABELS[lastCreated.category] ?? lastCreated.category}
              </div>
              {lastCreated.duration && (
                <div>
                  <span className="font-semibold">Duration:</span>{" "}
                  {lastCreated.duration} minutes
                </div>
              )}
            </div>

            <button
              onClick={() => setShowThanks(false)}
              className="mt-5 w-full py-3 rounded-xl font-bold font-sans text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              style={{
                backgroundColor: "#0C115B",
                color: "white",
                boxShadow: "0 8px 24px rgba(12,17,91,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                border: "1px solid rgba(12,17,91,0.6)",
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

