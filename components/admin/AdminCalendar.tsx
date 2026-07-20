"use client"

import { useMemo, useRef, useState, useEffect } from "react"
import { addDays, addHours, addMonths, addWeeks, format, isAfter, isBefore, parseISO, startOfDay, startOfWeek, subWeeks } from "date-fns"
import { pl } from "date-fns/locale"
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Ban, Settings } from "lucide-react"
import type { TaskCategory } from "@/lib/calendar-types"
import {
  CALENDAR_START_HOUR,
  CALENDAR_END_HOUR,
  SESSION_DURATION,
  PX_PER_MINUTE,
  GRID_TOTAL_HEIGHT,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "@/lib/calendar-types"
import { id } from "@instantdb/react"
import { db } from "@/lib/db"
import { resolveSlotsForDate, type ScheduleSlotRecord } from "@/lib/schedule-slots"
import {
  resolveInCabinetWeekdaysForDate,
  type InCabinetDayRecord,
} from "@/lib/in-cabinet-days"
import { getAdminCategoryForDate, isSaturdayDate } from "@/lib/visit-category"
import { snapTimeToFullHour } from "@/lib/time-options"
import { DayColumn } from "@/components/calendar/DayColumn"
import { authedJsonGet, authedJsonPost } from "@/lib/auth-client"
import { AddTaskModal } from "@/components/calendar/AddTaskModal"

type Meeting = {
  id: string
  title: string
  description?: string
  category: TaskCategory
  date: string
  time?: string
  duration?: number
  userId?: string
  userEmail?: string
  userPhone?: string
  createdBy?: "admin" | "guest" | string
  createdAt?: string
  status?: "confirmed" | "not_confirmed" | string
  updatedAt?: string
  lastEditedBy?: "admin" | "guest" | string
  previousDate?: string
  previousTime?: string
  previousDuration?: number
  changeRequestedAt?: string
}

function toDateStr(date: Date): string {
  return format(date, "yyyy-MM-dd")
}


function isUserOwnedMeeting(m: Meeting): boolean {
  // Primary signal for new data.
  if (m.createdBy === "guest") return true
  if (m.createdBy === "admin") return false

  // Backward-compatible fallback for older records that do not have createdBy.
  if (Boolean(m.userId)) return true
  if (m.lastEditedBy === "guest") return true
  // Legacy data fallback: if ownership is unknown, prefer confirmation flow
  // so admin edits don't silently skip guest confirmation.
  return true
}

export function AdminCalendar({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const now = useMemo(() => new Date(), [])
  const maxBookingDate = useMemo(() => addMonths(today, 1), [today])
  const minBookingDateTime = useMemo(() => addHours(now, 2), [now])
  const currentWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today])

  // Navigation range spans the full booking window (today → +1 month)
  const minWeekStart = currentWeekStart
  const maxWeekStart = startOfWeek(maxBookingDate, { weekStartsOn: 1 })

  const [weekStart, setWeekStart] = useState(() => currentWeekStart)
  const [saturdayExpanded, setSaturdayExpanded] = useState(false)
  const [modalConfig, setModalConfig] = useState<{ date: string; time?: string } | null>(null)
  const [editing, setEditing] = useState<Meeting | null>(null)
  const draggingId = useRef<string | null>(null)
  const dragOffsetY = useRef<number>(0)

  useEffect(() => {
    setSaturdayExpanded(false)
  }, [weekStart])

  const { isLoading, error, data } = db.useQuery({ meetings: {} })
  const meetings = ((data?.meetings ?? []) as Meeting[]) ?? []

  // Blocked dates (admin-defined: holidays, vacations, etc.)
  const { data: blockedData } = db.useQuery({ blockedDates: {} })
  const blockedDateSet = useMemo<Set<string>>(() => {
    const records = (blockedData?.blockedDates ?? []) as unknown as { date: string }[]
    return new Set(records.map((r) => r.date))
  }, [blockedData])

  // Blocked individual slots (specific time on a specific date)
  const { data: blockedSlotsData } = db.useQuery({ blockedSlots: {} })
  const blockedSlotMap = useMemo<Map<string, Set<string>>>(() => {
    const records = (blockedSlotsData?.blockedSlots ?? []) as unknown as { date: string; time: string }[]
    const map = new Map<string, Set<string>>()
    for (const r of records) {
      if (!map.has(r.date)) map.set(r.date, new Set())
      map.get(r.date)!.add(r.time)
    }
    return map
  }, [blockedSlotsData])

  const { data: scheduleData } = db.useQuery({ scheduleSlots: {} })
  const scheduleSlotRecords = useMemo(
    () => (scheduleData?.scheduleSlots ?? []) as ScheduleSlotRecord[],
    [scheduleData],
  )

  const { data: bookingSettingsData } = db.useQuery({ bookingSettings: {} })
  const inCabinetDayRecords = useMemo(
    () => (bookingSettingsData?.bookingSettings ?? []) as InCabinetDayRecord[],
    [bookingSettingsData],
  )

  const weekEndDate = addDays(weekStart, 6)
  const weekLabel = `${format(weekStart, "d MMM", { locale: pl })} – ${format(weekEndDate, "d MMM yyyy", { locale: pl })}`

  const canGoPrev = isAfter(weekStart, minWeekStart) || toDateStr(weekStart) !== toDateStr(minWeekStart)
  const canGoNext = isBefore(weekStart, maxWeekStart)

  const isSlotBookable = (date: Date, time: string) => {
    const dateStr = toDateStr(date)
    if (blockedDateSet.has(dateStr)) return false
    if (blockedSlotMap.get(dateStr)?.has(time)) return false

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
    const newDuration = moving.duration ?? SESSION_DURATION
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
    if (!isSlotBookable(dayDate, time)) return false
    const dateStr = toDateStr(dayDate)
    if (isSaturdayDate(dateStr)) {
      if (!draggingId.current) return true
      return !doesConflict(dateStr, time, draggingId.current)
    }
    const daySlots = resolveSlotsForDate(dateStr, scheduleSlotRecords)
    if (!daySlots.includes(time)) return false
    if (!draggingId.current) return true
    return !doesConflict(dateStr, time, draggingId.current)
  }

  const findNextAvailableSlot = (): { dateStr: string; time: string } | null => {
    for (
      let d = new Date(now);
      !isAfter(startOfDay(d), maxBookingDate);
      d = addDays(d, 1)
    ) {
      if (isSaturdayDate(toDateStr(d))) continue
      const dateStr = toDateStr(d)
      const daySlots = resolveSlotsForDate(dateStr, scheduleSlotRecords)
      for (const time of daySlots) {
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

    const moving = meetings.find((m) => m.id === draggingId.current)
    if (!moving) {
      draggingId.current = null
      return
    }

    const relativeY = e.clientY - dragOffsetY.current - gridTop
    const minutesFromStart = relativeY / PX_PER_MINUTE
    const absoluteMinutes = CALENDAR_START_HOUR * 60 + minutesFromStart

    const targetDaySlots = resolveSlotsForDate(targetDate, scheduleSlotRecords)

    let newTime: string
    if (targetDaySlots.length === 0 && isSaturdayDate(targetDate)) {
      const relativeY = e.clientY - dragOffsetY.current - gridTop
      const minutesFromStart = relativeY / PX_PER_MINUTE
      const absoluteMinutes = CALENDAR_START_HOUR * 60 + minutesFromStart
      const h = Math.floor(absoluteMinutes / 60)
      const m = absoluteMinutes % 60
      newTime = snapTimeToFullHour(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      )
    } else if (targetDaySlots.length === 0) {
      draggingId.current = null
      return
    } else {
      // Snap to the nearest configured slot for that weekday
      newTime = targetDaySlots[0]
      let minDist = Infinity
      const relativeY = e.clientY - dragOffsetY.current - gridTop
      const minutesFromStart = relativeY / PX_PER_MINUTE
      const absoluteMinutes = CALENDAR_START_HOUR * 60 + minutesFromStart
      for (const slotTime of targetDaySlots) {
        const [sh, sm] = slotTime.split(":").map(Number)
        const dist = Math.abs(sh * 60 + sm - absoluteMinutes)
        if (dist < minDist) {
          minDist = dist
          newTime = slotTime
        }
      }
    }

    if (!isSlotBookable(parseISO(targetDate), newTime)) {
      draggingId.current = null
      return
    }

    if (draggingId.current && doesConflict(targetDate, newTime, draggingId.current)) {
      // prevent dropping onto a time that already has another meeting
      draggingId.current = null
      return
    }

    const nowIso = new Date().toISOString()
    const isUserMeeting = isUserOwnedMeeting(moving)

    db.transact(
      db.tx.meetings[draggingId.current].update({
        previousDate: isUserMeeting ? moving.date : null,
        previousTime: isUserMeeting ? moving.time : null,
        previousDuration: isUserMeeting ? moving.duration : null,
        date: targetDate,
        time: newTime,
        ...(isUserMeeting
          ? {
              status: "not_confirmed",
              changeRequestedAt: nowIso,
            }
          : {
              status: null,
              changeRequestedAt: null,
            }),
        lastEditedBy: "admin",
        updatedAt: nowIso,
      })
    )
      .then(() => {
        // Fire-and-forget n8n trigger for edited meetings.
        // n8n can use `status === "not_confirmed"` and/or `editedBy` to decide whether to email.
        authedJsonPost("/api/n8n/meetings", {
          event: "meeting.edited",
          editedBy: "admin",
          meetingId: moving.id,
          title: moving.title,
          description: moving.description,
          category: moving.category,
          userEmail: moving.userEmail,
          date: targetDate,
          time: newTime,
          duration: moving.duration,
          previousDate: isUserMeeting ? moving.date : null,
          previousTime: isUserMeeting ? moving.time : null,
          previousDuration: isUserMeeting ? moving.duration : null,
          status: isUserMeeting ? "not_confirmed" : null,
          changeRequestedAt: isUserMeeting ? nowIso : null,
          updatedAt: nowIso,
        }).catch(() => {})
      })
      .catch((err: any) => {
        console.error("InstantDB error (admin drag)", err)
        alert(err?.body?.message ?? err?.message ?? "Could not move the meeting.")
      })

    draggingId.current = null
  }

  const handleDelete = (meetingId: string) => {
    const meeting = meetings.find((m) => m.id === meetingId)
    const deletedAt = new Date().toISOString()
    const guestEmail = meeting?.userEmail

    // Trigger n8n so it can email the guest (admins deleting)
    if (guestEmail && meeting) {
      authedJsonPost("/api/n8n/meetings", {
        event: "meeting.deleted",
        deletedBy: "admin",
        meetingId,
        title: meeting.title,
        description: meeting.description,
        category: meeting.category,
        date: meeting.date,
        time: meeting.time,
        duration: meeting.duration,
        userEmail: guestEmail,
        deletedAt,
      }).catch(() => {})
    }

    db.transact(db.tx.meetings[meetingId].delete()).catch((err: any) => {
      console.error("InstantDB error (admin delete)", err)
      alert(err?.body?.message ?? err?.message ?? "Could not delete the meeting.")
    })
  }

  const handleAddMeeting = async (payload: {
    title: string
    description?: string
    category: TaskCategory
    date: string
    time?: string
    duration?: number
    email?: string
    phone?: string
  }) => {
    const expectedCategory = getAdminCategoryForDate(
      payload.date,
      resolveInCabinetWeekdaysForDate(payload.date, inCabinetDayRecords),
    )
    if (payload.category !== expectedCategory) {
      alert("Typ wizyty nie odpowiada wybranemu dniu. Wybierz inną datę lub odśwież stronę.")
      return false
    }

    const guestEmail = payload.email?.trim().toLowerCase() || undefined
    let guestUserId: string | undefined
    if (guestEmail) {
      try {
        const res = await authedJsonGet(
          `/api/admin/users/by-email?email=${encodeURIComponent(guestEmail)}`,
        )
        if (res.ok) {
          const body = (await res.json()) as { userId?: string | null }
          guestUserId = body.userId ?? undefined
        }
      } catch {
        // Patient may not have an Instant account yet — email ownership still applies.
      }
    }

    if (editing) {
      const nowIso = new Date().toISOString()
      const dateTimeChanged = editing.date !== payload.date || (editing.time ?? "") !== (payload.time ?? "")
      const durationChanged = (editing.duration ?? null) !== (payload.duration ?? null)
      const needsConfirmation = dateTimeChanged || durationChanged
      const isUserMeeting = isUserOwnedMeeting(editing)

      db.transact([
        (db.tx.meetings as any)[editing.id].update({
          title: payload.title,
          description: payload.description,
          category: payload.category,
          ...(needsConfirmation
            ? {
                previousDate: isUserMeeting ? editing.date : null,
                previousTime: isUserMeeting ? editing.time : null,
                previousDuration: isUserMeeting ? editing.duration : null,
                date: payload.date,
                time: payload.time,
                duration: payload.duration,
                ...(isUserMeeting
                  ? { status: "not_confirmed", changeRequestedAt: nowIso }
                  : { status: null, changeRequestedAt: null }),
              }
            : {
                // Admin edited a meeting but date/time/duration did not change.
                // Clear any previous confirmation state so NC label is removed.
                date: payload.date,
                time: payload.time,
                duration: payload.duration,
                previousDate: null,
                previousTime: null,
                previousDuration: null,
                status: isUserMeeting ? "confirmed" : null,
                changeRequestedAt: null,
              }),
          userEmail: guestEmail ?? null,
          userId: guestUserId ?? editing.userId ?? null,
          userPhone: payload.phone ?? null,
          lastEditedBy: "admin",
          updatedAt: nowIso,
        }),
      ])
        .then(() => {
          // Fire-and-forget n8n trigger for edited meetings.
          authedJsonPost("/api/n8n/meetings", {
            event: "meeting.edited",
            editedBy: "admin",
            meetingId: editing.id,
            title: payload.title,
            description: payload.description,
            category: payload.category,
            userEmail: guestEmail,
            userPhone: payload.phone ?? null,
            date: payload.date,
            time: payload.time,
            duration: payload.duration,
            status: needsConfirmation && isUserMeeting ? "not_confirmed" : isUserMeeting ? "confirmed" : null,
            ...(needsConfirmation && isUserMeeting
              ? {
                  previousDate: editing.date,
                  previousTime: editing.time,
                  previousDuration: editing.duration,
                  status: "not_confirmed",
                  changeRequestedAt: nowIso,
                }
              : {}),
            updatedAt: nowIso,
          }).catch(() => {})

          setModalConfig(null)
          setEditing(null)
        })
        .catch((err: any) => {
          console.error("InstantDB error (admin edit)", err)
          alert(err?.body?.message ?? err?.message ?? "Could not update the meeting.")
        })
    } else {
      const meetingId = id()
      const createdAt = new Date().toISOString()
      db.transact([
        // use any to avoid over-strict Instant generic typing here
        (db.tx.meetings as any)[meetingId].create({
          title: payload.title,
          description: payload.description,
          category: payload.category,
          date: payload.date,
          time: payload.time,
          duration: payload.duration,
          userEmail: guestEmail ?? null,
          userId: guestUserId ?? null,
          userPhone: payload.phone ?? null,
          createdBy: "admin",
          createdAt,
          lastEditedBy: "admin",
          updatedAt: createdAt,
        }),
      ])
        .then(() => {
          authedJsonPost("/api/n8n/meetings", {
            event: "meeting.created",
            meetingId,
            title: payload.title,
            description: payload.description,
            category: payload.category,
            date: payload.date,
            time: payload.time,
            duration: payload.duration,
            userEmail: guestEmail,
            userPhone: payload.phone ?? null,
            userId: guestUserId,
            createdAt,
            lastEditedBy: "admin",
            updatedAt: createdAt,
          }).catch(() => {})
        })
        .catch((err: any) => {
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
     className="relative 
                min-h-screen 
                flex 
                flex-col 
                before:content-[''] 
                before:absolute 
                before:inset-0 
                before:bg-[url('/images/x-bg.webp')] 
                before:bg-cover 
                before:bg-center 
                before:opacity-80 
                before:z-[-1]"
              >
      <header className="relative z-10 px-3 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 flex-shrink-0">
        <div
          className="max-w-full mx-auto rounded-2xl px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{
            background: "rgba(255,255,255,0.28)",
            backdropFilter: "blur(30px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.45)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.08), inset 0 2px 0 rgba(255,255,255,0.6)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="p-2 rounded-xl shrink-0"
              style={{
                background: "rgba(12,17,91,0.7)",
                border: "1px solid rgba(12,17,91,0.5)",
                boxShadow: "0 4px 12px rgba(12,17,91,0.3)",
              }}
            >
              <CalendarDays className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-slate-800 font-bold text-base sm:text-lg font-sans leading-tight">Planer wizyt</h1>
              <p className="text-slate-800 text-[11px] sm:text-xs font-sans truncate">{weekLabel}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center justify-center sm:justify-start gap-2">
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
              className="px-3 py-1.5 rounded-xl text-xs font-semibold font-sans text-slate-800 transition-all duration-200 hover:bg-white/40"
              style={{ border: "1px solid rgba(0,0,0,0.1)" }}
            >
              Dzisiaj
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
            </div>
            <button
              onClick={() => {
                const next = findNextAvailableSlot()
                if (next) {
                  setModalConfig({ date: next.dateStr, time: next.time })
                } else {
                  setModalConfig({ date: toDateStr(addDays(weekStart, 0)) })
                }
              }}
              className="w-full sm:w-auto sm:ml-1 flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-xl font-semibold font-sans text-sm text-white transition-all duration-200 hover:-translate-y-0.5"
              style={{
                backgroundColor: "#0C115B",
                boxShadow: "0 4px 16px rgba(12,17,91,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                border: "1px solid rgba(12,17,91,0.6)",
              }}
            >
              <Plus className="w-4 h-4" />
              Dodaj wizytę
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-3 pb-4 overflow-x-hidden overflow-y-auto sm:px-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-5 mb-2 sm:mb-3 px-0.5 sm:px-1">
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
                <span className="text-slate-800 text-[11px] font-sans">{label}</span>
              </div>
            )
          })}
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: "rgba(239, 68, 68, 1)",
              }}
            />
            <span className="text-slate-800 text-[11px] font-sans">Termin niedostępny</span>
          </div>
          <span className="hidden lg:flex ml-auto items-center gap-2 text-slate-800 text-[11px] font-sans">
            <span>Przeciągaj spotkania między dniami · Kliknij slot, aby dodać</span>
            <span className="flex items-center gap-1">
              <Ban className="w-3 h-3" />
              <span>Pola zajęte są wyłączone</span>
            </span>
          </span>
          <p className="w-full sm:w-auto sm:ml-auto text-slate-600 text-[10px] font-sans leading-snug lg:hidden">
            Kliknij wolny slot, aby dodać wizytę.
          </p>
        </div>

        <div className="overflow-x-auto sm:overflow-visible -mx-1 sm:mx-0 pb-1 sm:pb-0">
        <div className="flex gap-0 min-w-[520px] sm:min-w-0">
          {/* Drag-left zone to go to previous week */}
          <div
            className="hidden sm:block flex-shrink-0 pt-[52px] w-4"
            onDragEnter={(e) => {
              e.preventDefault()
              if (canGoPrev) {
                setWeekStart((w) => subWeeks(w, 1))
              }
            }}
          />

          <div className="flex-shrink-0 pr-1 sm:pr-2 pt-[44px] sm:pt-[52px] w-9 sm:w-[50px]">
            <div className="relative" style={{ height: GRID_TOTAL_HEIGHT }}>
              {Array.from(
                { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
                (_, i) => CALENDAR_START_HOUR + i,
              ).map((hour) => (
                <div
                  key={hour}
                  className="absolute right-0 flex justify-end pr-2"
                  style={{ top: (hour - CALENDAR_START_HOUR) * 60 * PX_PER_MINUTE }}
                >
                  <span className="text-slate-800 text-[9px] sm:text-[10px] font-sans -translate-y-1.5 leading-none tabular-nums">
                    {hour}:00
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-1 sm:gap-2 flex-1 min-w-0">
            {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
              const dayDate = addDays(weekStart, dayOffset)
              const dateStr = toDateStr(dayDate)
              const isSaturday = dayOffset === 5
              const isSunday = dayOffset === 6
              const saturdayNarrow = isSaturday && !saturdayExpanded
              const isBeforeToday = isBefore(dayDate, today)
              const isAfterBookingWindow = isAfter(startOfDay(dayDate), maxBookingDate)
              const isLocked = isBeforeToday || isAfterBookingWindow
              return (
                <div
                  key={dayOffset}
                  className={
                    isSunday || saturdayNarrow
                      ? "flex-[0_0_16px] sm:flex-[0_0_36px]"
                      : "flex-1 min-w-[72px] sm:min-w-0"
                  }
                >
                  <DayColumn
                    date={dayDate}
                    dateStr={dateStr}
                    tasks={meetings.filter((m) => m.date === dateStr) as any}
                    isWeekend={isSunday}
                    saturdayAdminMode={isSaturday}
                    saturdayCollapsed={saturdayNarrow}
                    onSaturdayExpand={() => setSaturdayExpanded(true)}
                    onSaturdayCollapse={() => setSaturdayExpanded(false)}
                    isLocked={isLocked}
                    isBlocked={blockedDateSet.has(dateStr)}
                    blockedTimes={blockedSlotMap.get(dateStr)}
                    scheduledSlots={resolveSlotsForDate(dateStr, scheduleSlotRecords)}
                    canBookSlot={canBookSlotForDay(dayDate)}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    onDelete={handleDelete}
                    onAddTask={(date, time) => setModalConfig({ date, time })}
                    onWeekendHover={
                      isSunday && canGoNext
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
        </div>
      </main>

      {modalConfig !== null && (
        <AddTaskModal
          key={`${editing?.id ?? "new"}-${modalConfig.date}-${modalConfig.time ?? ""}`}
          defaultDate={modalConfig.date}
          defaultTime={modalConfig.time}
          existingTasks={meetings as any}
          scheduleRecords={scheduleSlotRecords}
          initialTitle={editing?.title}
          initialDescription={editing?.description}
          initialCategory={editing?.category}
          editingTaskId={editing?.id}
          initialEmail={editing?.userEmail}
          initialPhone={editing?.userPhone}
          showEmailField
          showPhoneField
          requirePhone={false}
          autoCategoryFromDate
          allowSaturdayDates
          inCabinetDayRecords={inCabinetDayRecords}
          onClose={() => {
            setModalConfig(null)
            setEditing(null)
          }}
          onAdd={handleAddMeeting}
        />
      )}

      {/* Bottom bar */}
      <footer className="px-3 sm:px-6 pb-4 sm:pb-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-xl text-sm font-semibold font-sans text-slate-800 transition-all duration-200 hover:bg-white/50 hover:-translate-y-0.5 active:translate-y-0"
            style={{
              background: "rgba(255,255,255,0.35)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.5)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <Settings className="w-4 h-4" />
            Ustawienia
          </button>
        )}
        <button
          onClick={() => {
            db.auth.signOut().catch((err: any) => {
              console.error("InstantDB error (admin sign out)", err)
              alert(err?.body?.message ?? err?.message ?? "Could not sign out.")
            })
          }}
          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl text-sm font-semibold font-sans text-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
          style={{
            backgroundColor: "#0C115B",
            boxShadow: "0 4px 16px rgba(12,17,91,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
            border: "1px solid rgba(12,17,91,0.6)",
          }}
        >
          Wyloguj się
        </button>
      </footer>
    </div>
  )
}

