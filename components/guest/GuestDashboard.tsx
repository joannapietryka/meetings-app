"use client"

import { useMemo, useState } from "react"
import { id } from "@instantdb/react"
import { db } from "@/lib/db"
import type { TaskCategory } from "@/lib/calendar-types"
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
}

const CATEGORY_LABELS: Record<string, string> = {
  bed1: "1-bed viewing",
  bed2: "2-beds viewing",
  contract: "Contract signing",
  other: "Other",
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
                  onClick={() => {
                    if (!confirm("Delete this meeting?")) return
                    db.transact(db.tx.meetings[m.id].delete()).catch((err: any) => {
                      console.error("InstantDB error (guest delete)", err)
                      alert(err?.body?.message ?? err?.message ?? "Could not delete your meeting.")
                    })
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
          onClick={() => db.auth.signOut()}
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
          defaultDate={editing?.date ?? new Date().toISOString().slice(0, 10)}
          defaultTime={editing?.time}
          existingTasks={myMeetings as any}
          initialTitle={editing?.title}
          initialDescription={editing?.description}
          initialCategory={editing?.category}
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
              db.transact(
                db.tx.meetings[editing.id].update({
                  ...payload,
                })
              )
                .then(() => {
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
              db.transact([
                (db.tx.meetings as any)[meetingId].create({
                  ...payload,
                  createdAt: new Date().toISOString(),
                  userId: user?.id,
                  userEmail: user?.email,
                }),
              ])
                .then(() => {
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

