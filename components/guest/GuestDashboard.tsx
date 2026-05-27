"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  addHours,
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isWeekend,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { pl } from "date-fns/locale"
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from "lucide-react"
import { id } from "@instantdb/react"
import { db } from "@/lib/db"
import type { TaskCategory } from "@/lib/calendar-types"
import {
  CALENDAR_END_HOUR,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  DAY_SLOTS,
  SESSION_DURATION,
} from "@/lib/calendar-types"
import { AddTaskModal } from "@/components/calendar/AddTaskModal"

function meetingDateLocal(dateStr: string): Date {
  return parse(dateStr, "yyyy-MM-dd", new Date())
}

/** Returns "YYYY-MM-DD" of the Monday of the week containing dateStr (ISO week aligned to Monday). */
function getWeekKey(dateStr: string): string {
  const date = meetingDateLocal(dateStr)
  const dow = date.getDay()
  const diffToMonday = dow === 0 ? -6 : 1 - dow
  const monday = addDays(date, diffToMonday)
  return format(monday, "yyyy-MM-dd")
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

const GUEST_DISPLAY_NAME_STORAGE_KEY = "app-meetings:guest-display-name"
const GUEST_AVAILABILITY_SNAPSHOT_STORAGE_KEY = "app-meetings:guest-availability-snapshot"
const AVAILABILITY_REQUEST_TIMEOUT_MS = 12000

function readGuestCachedDisplayName(): string | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const v = localStorage.getItem(GUEST_DISPLAY_NAME_STORAGE_KEY)?.trim()
    return v || undefined
  } catch {
    return undefined
  }
}

function writeGuestCachedDisplayName(name: string) {
  if (typeof window === "undefined") return
  try {
    const t = name.trim()
    if (t) localStorage.setItem(GUEST_DISPLAY_NAME_STORAGE_KEY, t)
  } catch {
    // ignore quota / private mode
  }
}

function getAvailabilityErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const message = err.message.trim()
    if (err.name === "AbortError" || /timeout|timed out|aborted/i.test(message)) {
      return "Nie udało się odświeżyć zajętych terminów. Spróbuj ponownie."
    }
    return message || "Nie udało się pobrać dostępności."
  }
  return "Nie udało się pobrać dostępności."
}

function readGuestAvailabilitySnapshot(): { meetings: AvailabilityMeeting[] } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(GUEST_AVAILABILITY_SNAPSHOT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const meetings: unknown[] | null = Array.isArray(parsed?.meetings)
      ? parsed.meetings
      : Array.isArray(parsed)
        ? parsed
        : null
    if (!meetings) return null
    return {
      meetings: meetings.filter(
        (meeting): meeting is AvailabilityMeeting => {
          if (!meeting || typeof meeting !== "object") return false
          const candidate = meeting as Record<string, unknown>
          return (
            typeof candidate.id === "string" &&
            typeof candidate.date === "string" &&
            typeof candidate.time === "string"
          )
        },
      ),
    }
  } catch {
    return null
  }
}

function writeGuestAvailabilitySnapshot(meetings: AvailabilityMeeting[]) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(GUEST_AVAILABILITY_SNAPSHOT_STORAGE_KEY, JSON.stringify({ meetings }))
  } catch {
    // ignore quota / private mode
  }
}

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

type AvailabilityMeeting = Pick<Meeting, "id" | "date" | "time" | "duration">

function toDateTime(m: Meeting): number {
  const [year, month, day] = m.date.split("-").map(Number)
  const [h, min] = (m.time ?? "00:00").split(":").map(Number)
  return new Date(year, month - 1, day, h, min).getTime()
}

function isDateInBookingWindow(day: Date, today: Date, maxBookingDate: Date): boolean {
  const sod = startOfDay(day)
  return !isBefore(sod, today) && !isAfter(sod, maxBookingDate)
}

function getSlotsForDate(dateStr: string, slots: Record<number, string[]>): string[] {
  return slots[meetingDateLocal(dateStr).getDay()] ?? []
}

function fitsInDay(time: string): boolean {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m + SESSION_DURATION <= CALENDAR_END_HOUR * 60
}

type DisabledDateReason =
  | "existing_visit"
  | "week_limit"
  | "month_limit"
  | "blocked"
  | "no_slots"

export function GuestDashboard() {
  const cachedAvailabilitySnapshot = useMemo(() => readGuestAvailabilitySnapshot(), [])
  const user = db.useUser()
  const { isLoading, error, data } = db.useQuery({ meetings: {} })
  const myMeetings = (data?.meetings ?? []) as Meeting[]

  const { data: blockedData } = db.useQuery({ blockedDates: {} })
  const blockedDateSet = useMemo(
    () => new Set(((blockedData?.blockedDates ?? []) as unknown as { date: string }[]).map((b) => b.date)),
    [blockedData],
  )

  const { data: blockedSlotsData } = db.useQuery({ blockedSlots: {} })
  const adminBlockedSlots = useMemo<Map<string, Set<string>>>(() => {
    const records = (blockedSlotsData?.blockedSlots ?? []) as unknown as { date: string; time: string }[]
    const map = new Map<string, Set<string>>()
    for (const r of records) {
      if (!map.has(r.date)) map.set(r.date, new Set())
      map.get(r.date)!.add(r.time)
    }
    return map
  }, [blockedSlotsData])

  const { data: scheduleData } = db.useQuery({ scheduleSlots: {} })
  const dynamicDaySlots = useMemo<Record<number, string[]>>(() => {
    const records = (scheduleData?.scheduleSlots ?? []) as unknown as { day: number; slots: string }[]
    const map: Record<number, string[]> = { ...DAY_SLOTS }
    for (const r of records) {
      try {
        map[r.day] = JSON.parse(r.slots)
      } catch {}
    }
    return map
  }, [scheduleData])

  const sortedMeetings = useMemo(
    () => [...myMeetings].sort((a, b) => toDateTime(a) - toDateTime(b)),
    [myMeetings],
  )

  const now = useMemo(() => new Date(), [])
  const today = useMemo(() => startOfDay(new Date()), [])
  /** Inclusive last day guests may book (30 days from today). */
  const maxBookingDate = useMemo(() => addDays(today, 30), [today])
  const minBookingDateTime = useMemo(() => addHours(now, 2), [now])

  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today))
  const [showForm, setShowForm] = useState(false)
  const [showThanks, setShowThanks] = useState(false)
  const [lastCreated, setLastCreated] = useState<Meeting | null>(null)
  const [editing, setEditing] = useState<Meeting | null>(null)
  const [modalDefaultDate, setModalDefaultDate] = useState<string>(() => format(today, "yyyy-MM-dd"))
  const [isPreparingBooking, setIsPreparingBooking] = useState(false)
  const [availabilityMeetings, setAvailabilityMeetings] = useState<AvailabilityMeeting[]>(
    () => cachedAvailabilitySnapshot?.meetings ?? [],
  )
  const [availabilityStatus, setAvailabilityStatus] = useState<"loading" | "ready" | "error">(() =>
    cachedAvailabilitySnapshot ? "ready" : "loading",
  )
  const [availabilityErrorMessage, setAvailabilityErrorMessage] = useState<string | null>(null)
  const [hasAvailabilitySnapshot, setHasAvailabilitySnapshot] = useState(() => Boolean(cachedAvailabilitySnapshot))
  const isMountedRef = useRef(true)
  const availabilityAbortRef = useRef<AbortController | null>(null)
  const availabilityRequestIdRef = useRef(0)
  const availabilityMeetingsRef = useRef<AvailabilityMeeting[]>(cachedAvailabilitySnapshot?.meetings ?? [])
  const hasAvailabilitySnapshotRef = useRef(Boolean(cachedAvailabilitySnapshot))

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      availabilityAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    availabilityMeetingsRef.current = availabilityMeetings
  }, [availabilityMeetings])

  useEffect(() => {
    hasAvailabilitySnapshotRef.current = hasAvailabilitySnapshot
  }, [hasAvailabilitySnapshot])

  const refreshAvailability = useCallback(
    async ({ requireFresh = false }: { requireFresh?: boolean } = {}): Promise<AvailabilityMeeting[]> => {
      const from = format(today, "yyyy-MM-dd")
      const to = format(maxBookingDate, "yyyy-MM-dd")
      const hadSnapshot = hasAvailabilitySnapshotRef.current
      const requestId = availabilityRequestIdRef.current + 1
      availabilityRequestIdRef.current = requestId
      availabilityAbortRef.current?.abort()
      const controller = new AbortController()
      availabilityAbortRef.current = controller
      const timeoutId = setTimeout(() => controller.abort(), AVAILABILITY_REQUEST_TIMEOUT_MS)

      if (!hadSnapshot) {
        setAvailabilityStatus("loading")
      }
      setAvailabilityErrorMessage(null)

      try {
        const res = await fetch(`/api/guest/availability?from=${from}&to=${to}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.message ?? "Nie udało się pobrać dostępności.")
        }
        const payload = (await res.json()) as { meetings?: AvailabilityMeeting[] }
        const nextMeetings = payload.meetings ?? []
        if (!isMountedRef.current || availabilityRequestIdRef.current !== requestId) {
          return nextMeetings
        }
        availabilityMeetingsRef.current = nextMeetings
        hasAvailabilitySnapshotRef.current = true
        setAvailabilityMeetings(nextMeetings)
        writeGuestAvailabilitySnapshot(nextMeetings)
        setHasAvailabilitySnapshot(true)
        setAvailabilityStatus("ready")
        setAvailabilityErrorMessage(null)
        return nextMeetings
      } catch (err) {
        const message = getAvailabilityErrorMessage(err)
        if (isMountedRef.current && availabilityRequestIdRef.current === requestId) {
          console.error("[guest availability]", err)
          setAvailabilityErrorMessage(message)
          if (!hadSnapshot) {
            availabilityMeetingsRef.current = []
            setAvailabilityMeetings([])
            setAvailabilityStatus("error")
          }
        }
        if (requireFresh) {
          throw new Error(message)
        }
        return availabilityMeetingsRef.current
      } finally {
        clearTimeout(timeoutId)
        if (availabilityAbortRef.current === controller) {
          availabilityAbortRef.current = null
        }
      }
    },
    [today, maxBookingDate],
  )

  useEffect(() => {
    refreshAvailability().catch(() => {})
  }, [refreshAvailability])

  useEffect(() => {
    const handleFocus = () => {
      refreshAvailability().catch(() => {})
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAvailability().catch(() => {})
      }
    }

    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshAvailability().catch(() => {})
      }
    }, 15000)

    return () => {
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.clearInterval(intervalId)
    }
  }, [refreshAvailability])

  const relevantMeetings = useMemo(
    () => myMeetings.filter((m) => m.id !== editing?.id),
    [myMeetings, editing],
  )

  const disabledDateReasons = useMemo(() => {
    const reasons = new Map<string, DisabledDateReason>()

    for (const m of relevantMeetings) {
      reasons.set(m.date, "existing_visit")
    }

    const meetingsPerWeek = new Map<string, number>()
    for (const m of relevantMeetings) {
      const wk = getWeekKey(m.date)
      meetingsPerWeek.set(wk, (meetingsPerWeek.get(wk) ?? 0) + 1)
    }

    for (const [weekKey, count] of meetingsPerWeek) {
      if (count >= 1) {
        const monday = meetingDateLocal(weekKey)
        for (let i = 0; i < 5; i++) {
          const d = addDays(monday, i)
          if (isDateInBookingWindow(d, today, maxBookingDate)) {
            const dateStr = format(d, "yyyy-MM-dd")
            if (!reasons.has(dateStr)) {
              reasons.set(dateStr, "week_limit")
            }
          }
        }
      }
    }

    const meetingsPerMonth = new Map<string, number>()
    for (const m of relevantMeetings) {
      const mk = getMonthKey(m.date)
      meetingsPerMonth.set(mk, (meetingsPerMonth.get(mk) ?? 0) + 1)
    }

    for (const [ym, count] of meetingsPerMonth) {
      if (count < 4) continue
      const [y, mo] = ym.split("-").map(Number)
      let d = new Date(y, mo - 1, 1)
      const last = endOfMonth(d)
      while (d <= last) {
        if (isDateInBookingWindow(d, today, maxBookingDate)) {
          const dateStr = format(d, "yyyy-MM-dd")
          if (!reasons.has(dateStr)) {
            reasons.set(dateStr, "month_limit")
          }
        }
        d = addDays(d, 1)
      }
    }

    for (const date of blockedDateSet) {
      reasons.set(date, "blocked")
    }

    return reasons
  }, [relevantMeetings, blockedDateSet, today, maxBookingDate])

  const disabledDates = useMemo(() => new Set(disabledDateReasons.keys()), [disabledDateReasons])

  const hasFreeSlotsByDate = useMemo(() => {
    const map = new Map<string, boolean>()

    for (let day = today; !isAfter(day, maxBookingDate); day = addDays(day, 1)) {
      const dateStr = format(day, "yyyy-MM-dd")

      if (isWeekend(day) || blockedDateSet.has(dateStr)) {
        map.set(dateStr, false)
        continue
      }

      const takenSlots = new Set(
        availabilityMeetings
          .filter((meeting) => meeting.date === dateStr && meeting.time)
          .map((meeting) => meeting.time as string),
      )

      const hasFreeSlot = getSlotsForDate(dateStr, dynamicDaySlots).some((slot) => {
        const [h, m] = slot.split(":").map(Number)
        const slotDateTime = new Date(day)
        slotDateTime.setHours(h, m, 0, 0)

        return (
          fitsInDay(slot) &&
          !isBefore(slotDateTime, minBookingDateTime) &&
          !adminBlockedSlots.get(dateStr)?.has(slot) &&
          !takenSlots.has(slot)
        )
      })

      map.set(dateStr, hasFreeSlot)
    }

    return map
  }, [today, maxBookingDate, availabilityMeetings, blockedDateSet, adminBlockedSlots, minBookingDateTime, dynamicDaySlots])

  const unavailableDates = useMemo(() => {
    const combined = new Set(disabledDates)

    for (const [dateStr, hasFreeSlots] of hasFreeSlotsByDate) {
      if (!hasFreeSlots) combined.add(dateStr)
    }

    return combined
  }, [disabledDates, hasFreeSlotsByDate])

  const meetingsByDate = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    for (const m of myMeetings) {
      const list = map.get(m.date) ?? []
      list.push(m)
      map.set(m.date, list)
    }
    return map
  }, [myMeetings])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth)
    const monthEnd = endOfMonth(visibleMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [visibleMonth])

  const calendarWeeks = useMemo(() => {
    const weeks: Date[][] = []
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7))
    }
    return weeks
  }, [calendarDays])

  const availabilityReady = availabilityStatus === "ready"
  const availabilityUsable = availabilityReady || hasAvailabilitySnapshot

  const isSlotAvailable = useCallback(
    (
      dateStr: string,
      time: string,
      meetings: AvailabilityMeeting[],
      excludeMeetingId?: string,
    ) => {
      const date = meetingDateLocal(dateStr)
      if (isWeekend(date)) return false
      if (!isDateInBookingWindow(date, today, maxBookingDate)) return false
      if (blockedDateSet.has(dateStr)) return false
      if (!getSlotsForDate(dateStr, dynamicDaySlots).includes(time)) return false
      if (!fitsInDay(time)) return false
      if (adminBlockedSlots.get(dateStr)?.has(time)) return false

      const [h, m] = time.split(":").map(Number)
      const slotDateTime = new Date(date)
      slotDateTime.setHours(h, m, 0, 0)
      if (isBefore(slotDateTime, minBookingDateTime)) return false

      return !meetings.some((meeting) => {
        if (meeting.id === excludeMeetingId) return false
        return meeting.date === dateStr && meeting.time === time
      })
    },
    [today, maxBookingDate, blockedDateSet, dynamicDaySlots, adminBlockedSlots, minBookingDateTime],
  )

  const hasFreeSlotOnDate = useCallback(
    (dateStr: string, meetings: AvailabilityMeeting[], excludeMeetingId?: string) => {
      const slots = getSlotsForDate(dateStr, dynamicDaySlots)
      return slots.some((slot) => isSlotAvailable(dateStr, slot, meetings, excludeMeetingId))
    },
    [dynamicDaySlots, isSlotAvailable],
  )

  const findNextAvailableDateForMeetings = useCallback(
    (meetings: AvailabilityMeeting[]) => {
      for (let day = today; !isAfter(day, maxBookingDate); day = addDays(day, 1)) {
        const dateStr = format(day, "yyyy-MM-dd")
        if (isWeekend(day)) continue
        if (disabledDates.has(dateStr)) continue
        if (!hasFreeSlotOnDate(dateStr, meetings)) continue
        return dateStr
      }
      return null
    },
    [today, maxBookingDate, disabledDates, hasFreeSlotOnDate],
  )

  const ensureFreshSlotAvailability = useCallback(
    async (
      payload: Pick<Meeting, "date" | "time">,
      excludeMeetingId?: string,
    ) => {
      if (!payload.time) return true
      try {
        const latestAvailability = await refreshAvailability({ requireFresh: true })
        if (isSlotAvailable(payload.date, payload.time, latestAvailability, excludeMeetingId)) {
          return true
        }
        alert("Ten termin został właśnie zajęty. Wybierz inny termin.")
        refreshAvailability().catch(() => {})
        return false
      } catch (err) {
        alert(getAvailabilityErrorMessage(err))
        return false
      }
    },
    [isSlotAvailable, refreshAvailability],
  )

  const nextAvailableDate = useMemo(() => {
    if (!availabilityUsable) return null
    return findNextAvailableDateForMeetings(availabilityMeetings)
  }, [availabilityMeetings, availabilityUsable, findNextAvailableDateForMeetings])

  const canNavigatePrev = startOfMonth(visibleMonth) > startOfMonth(today)
  const canNavigateNext = startOfMonth(visibleMonth) < startOfMonth(maxBookingDate)

  const openFreshBookingModal = useCallback(
    async (preferredDate?: string) => {
      if (isPreparingBooking) return
      setIsPreparingBooking(true)
      try {
        const latestAvailability = await refreshAvailability({ requireFresh: true })
        if (preferredDate) {
          if (!hasFreeSlotOnDate(preferredDate, latestAvailability)) {
            alert("Brak wolnych terminów w tym dniu.")
            return
          }
          setEditing(null)
          setModalDefaultDate(preferredDate)
          setShowForm(true)
          return
        }

        const freshNextAvailableDate = findNextAvailableDateForMeetings(latestAvailability)
        if (!freshNextAvailableDate) {
          alert("Brak wolnych terminów w najbliższych 30 dniach.")
          return
        }

        setEditing(null)
        setModalDefaultDate(freshNextAvailableDate)
        setVisibleMonth(startOfMonth(meetingDateLocal(freshNextAvailableDate)))
        setShowForm(true)
      } catch (err) {
        alert(getAvailabilityErrorMessage(err))
      } finally {
        setIsPreparingBooking(false)
      }
    },
    [
      findNextAvailableDateForMeetings,
      hasFreeSlotOnDate,
      isPreparingBooking,
      refreshAvailability,
    ],
  )

  const openDay = async (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd")
    const mineOnDay = myMeetings.find((m) => m.date === dateStr)

    if (mineOnDay) {
      setEditing(mineOnDay)
      setModalDefaultDate(dateStr)
      setShowForm(true)
      return
    }

    if (!availabilityUsable) {
      alert(
        availabilityStatus === "error"
          ? availabilityErrorMessage ?? "Nie udało się pobrać dostępności. Odśwież stronę i spróbuj ponownie."
          : "Sprawdzam dostępność terminów. Spróbuj ponownie za chwilę.",
      )
      return
    }

    if (isWeekend(day)) {
      alert("Rezerwacje są możliwe tylko w dni robocze.")
      return
    }

    if (!isDateInBookingWindow(day, today, maxBookingDate)) {
      alert("Rezerwacje są możliwe wyłącznie na najbliższe 30 dni.")
      return
    }

    if (blockedDateSet.has(dateStr)) {
      alert("Ten dzień jest niedostępny.")
      return
    }

    const localDisableReason = disabledDateReasons.get(dateStr)
    if (localDisableReason === "week_limit" || localDisableReason === "month_limit") {
      alert(
        "Nie możesz zarezerwować wizyty w tym dniu (limit tygodniowy, miesięczny lub inna blokada).",
      )
      return
    }

    await openFreshBookingModal(dateStr)
  }

  const [hasWindow, setHasWindow] = useState(false)
  const [deletingMeeting, setDeletingMeeting] = useState<Meeting | null>(null)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
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

    db.transact(db.tx.meetings[meeting.id].delete())
      .then(() => {
        refreshAvailability().catch(() => {})
      })
      .catch((err: any) => {
        console.error("InstantDB error (guest delete)", err)
        alert(err?.body?.message ?? err?.message ?? "Nie udało się usunąć wizyty.")
      })
  }

  const handleDeleteAccount = async () => {
    if (!user?.id || !user?.email) return
    setIsDeletingAccount(true)
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, userEmail: user.email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message ?? "Nie udało się usunąć konta.")
      }
      await db.auth.signOut()
    } catch (err: any) {
      alert(err?.message ?? "Wystąpił błąd. Spróbuj ponownie.")
      setIsDeletingAccount(false)
      setShowDeleteAccount(false)
    }
  }

  if (isLoading) return null
  if (error) {
    return <div className="p-4 text-red-500">Błąd: {error.message}</div>
  }

  return (
    <div
      className="relative min-h-screen flex flex-col before:content-[''] 
  before:absolute 
  before:inset-0 
  before:bg-[url('/images/blue-bg.jpg')] 
  before:bg-cover 
  before:bg-center 
  before:opacity-80 
  before:z-[-1]"
    >
      <header className="relative z-10 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 flex-shrink-0">
        <div
          className="max-w-5xl mx-auto rounded-2xl px-4 py-3.5 sm:px-5 flex items-center justify-between gap-3"
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
              <h1 className="text-slate-800 font-bold text-lg font-sans leading-tight">Moje wizyty</h1>
              <p className="text-slate-800 text-xs font-sans">
                Maks. 1 wizyta w tygodniu, 4 w miesiącu, tylko dni robocze i 30 dni do przodu.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!nextAvailableDate || isPreparingBooking}
            onClick={() => {
              void openFreshBookingModal()
            }}
            className="ml-1 flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold font-sans text-sm text-white transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
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
      </header>

      <main className="relative z-10 flex-1 px-4 pb-4 overflow-auto sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center gap-4 mb-3 px-1 flex-wrap">
          {(Object.keys(CATEGORY_LABELS) as TaskCategory[]).map((cat) => {
            const colors = CATEGORY_COLORS[cat]
            return (
              <div key={cat} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.dot }} />
                <span className="text-slate-800 text-[11px] font-sans">{CATEGORY_LABELS[cat]}</span>
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
          <span className="sm:ml-auto text-slate-800 text-[11px] font-sans">
            Kliknij dzień, aby dodać lub edytować wizytę
          </span>
        </div>
        {!availabilityUsable && (
          <div
            className="max-w-5xl mx-auto mb-3 px-3 py-2 rounded-xl text-xs font-semibold font-sans flex items-center justify-between gap-3"
            style={{
              background:
                availabilityStatus === "error"
                  ? "rgba(254,226,226,0.25)"
                  : "rgba(255,255,255,0.28)",
              border:
                availabilityStatus === "error"
                  ? "1.5px dashed rgba(239,68,68,0.3)"
                  : "1px solid rgba(255,255,255,0.45)",
              color: availabilityStatus === "error" ? "#b91c1c" : "#475569",
              backdropFilter: "blur(12px)",
            }}
          >
            <span>
              {availabilityStatus === "error"
                ? availabilityErrorMessage ?? "Nie udało się pobrać zajętych terminów. Dodawanie wizyt jest chwilowo zablokowane."
                : "Sprawdzam zajęte terminy..."}
            </span>
            <button
              type="button"
              onClick={() => {
                refreshAvailability().catch(() => {})
              }}
              className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold font-sans transition-colors hover:bg-white/30"
              style={{
                border: "1px solid rgba(0,0,0,0.1)",
                background: "rgba(255,255,255,0.22)",
                color: availabilityStatus === "error" ? "#991b1b" : "#334155",
              }}
              aria-label="Ponów pobieranie terminów"
            >
              Ponów
            </button>
          </div>
        )}
        <div
          className="rounded-2xl p-3 sm:p-4 max-w-5xl mx-auto"
          data-testid="guest-calendar"
          style={{
            background: "rgba(255,255,255,0.18)",
            border: "1px solid rgba(255,255,255,0.45)",
            backdropFilter: "blur(18px)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 18px rgba(0,0,0,0.05)",
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-800 font-sans capitalize">
                {format(visibleMonth, "LLLL yyyy", { locale: pl })}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Poprzedni miesiąc"
                disabled={!canNavigatePrev}
                onClick={() => setVisibleMonth((m) => addMonths(m, -1))}
                className="p-2 rounded-xl transition-all duration-200 hover:bg-white/40 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                style={{ border: "1px solid rgba(0,0,0,0.1)" }}
              >
                <ChevronLeft className="w-4 h-4 text-slate-700" />
              </button>
              <button
                type="button"
                aria-label="Następny miesiąc"
                disabled={!canNavigateNext}
                onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
                className="p-2 rounded-xl transition-all duration-200 hover:bg-white/40 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                style={{ border: "1px solid rgba(0,0,0,0.1)" }}
              >
                <ChevronRight className="w-4 h-4 text-slate-700" />
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 text-center text-[10px] sm:text-xs font-semibold text-slate-800 uppercase tracking-wide mb-1.5">
            {["pon", "wt", "śr", "czw", "pt", "sob", "nd"].map((wd, idx) => (
              <div
                key={wd}
                className="py-1"
                style={{ flex: idx >= 5 ? "0 0 36px" : "1 1 0" }}
              >
                {wd}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            {calendarWeeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="flex gap-1.5">
                {week.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd")
                  const inMonth = isSameMonth(day, visibleMonth)
                  const isTodayCell = isSameDay(day, today)
                  const sod = startOfDay(day)
                  const isPast = isBefore(sod, today)
                  const isBeyondBookable = isAfter(sod, maxBookingDate)
                  const booked = meetingsByDate.get(dateStr) ?? []
                  const hasVisit = booked.length > 0
                  const mineOnDay = myMeetings.find((m) => m.date === dateStr)
                  const isWeekendCell = isWeekend(day)
                  const disabledReason =
                    disabledDateReasons.get(dateStr) ??
                    (hasFreeSlotsByDate.get(dateStr) === false ? "no_slots" : undefined)

                  const isCalendarDisabled = isWeekendCell || isPast || isBeyondBookable
                  const colors = mineOnDay ? CATEGORY_COLORS[mineOnDay.category] : undefined

                  const canClick =
                    inMonth &&
                    !isCalendarDisabled &&
                    (Boolean(mineOnDay) ||
                      (availabilityUsable && !blockedDateSet.has(dateStr) && !unavailableDates.has(dateStr)))

                  const showsDisabledVisit = Boolean(mineOnDay && colors) && !canClick
                  const isDisabledCell = !canClick
                  const hasUnavailableStyle =
                    !mineOnDay && (disabledReason === "blocked" || disabledReason === "no_slots")
                  const useWeekendDisabledStyle = isWeekendCell && isDisabledCell
                  const interactiveClass = canClick
                    ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0C115B]/50"
                    : "pointer-events-none"

                  const cellClass = `relative overflow-hidden rounded-xl flex h-full flex-col transition-colors text-slate-800 w-full ${
                    isWeekendCell
                      ? "min-h-[92px] self-stretch items-center justify-start px-1 py-2 text-center"
                      : "min-h-[88px] sm:min-h-[112px] p-2 items-start text-left"
                  } ${interactiveClass} ${isTodayCell ? "ring-2 ring-[#0C115B]/40" : ""} ${
                    !inMonth ? "text-slate-400" : ""
                  }`.trim()

                  const cellStyle: React.CSSProperties = {
                    backgroundColor: hasVisit && colors && !showsDisabledVisit
                        ? colors.bg
                        : useWeekendDisabledStyle
                          ? "rgba(148,163,184,0.12)"
                          : hasUnavailableStyle
                          ? "rgba(254,226,226,0.25)"
                          : showsDisabledVisit
                            ? "rgba(148,163,184,0.14)"
                            : canClick
                              ? "rgba(255,255,255,0.28)"
                              : "rgba(148,163,184,0.12)",
                    backgroundImage: isDisabledCell && (!hasUnavailableStyle || useWeekendDisabledStyle)
                      ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 1px, transparent 1px, transparent 10px)"
                      : undefined,
                    border: hasVisit && colors && !showsDisabledVisit
                      ? `1px solid ${colors.border}`
                      : useWeekendDisabledStyle
                        ? "1px solid rgba(255,255,255,0.24)"
                        : hasUnavailableStyle
                        ? "1.5px dashed rgba(239,68,68,0.3)"
                        : canClick
                          ? "1px solid rgba(255,255,255,0.45)"
                          : "1px solid rgba(255,255,255,0.24)",
                    backdropFilter: "blur(14px)",
                    boxShadow: hasVisit && colors && !showsDisabledVisit
                      ? "0 4px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.4)"
                      : isDisabledCell
                        ? "inset 0 1px 0 rgba(255,255,255,0.24)"
                        : "inset 0 1px 0 rgba(255,255,255,0.45)",
                    cursor: canClick ? "pointer" : "not-allowed",
                  }

                  const inner = (
                    <>
                      <div
                        className={`w-full ${isWeekendCell ? "flex flex-col items-center gap-1" : "flex items-start justify-between gap-1"}`}
                      >
                        <span
                          className={`font-semibold tabular-nums ${
                            isWeekendCell ? "text-[11px] text-slate-600" : "text-xs sm:text-sm"
                          }`}
                        >
                          {format(day, "d", { locale: pl })}
                        </span>
                        {mineOnDay && colors && !isWeekendCell && (
                          <span
                            className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold font-sans whitespace-nowrap"
                            style={{
                              background: showsDisabledVisit ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.45)",
                              border: showsDisabledVisit
                                ? "1px dashed rgba(100,116,139,0.28)"
                                : `1px solid ${colors.border}`,
                              color: showsDisabledVisit ? "#475569" : colors.dot,
                            }}
                          >
                            {CATEGORY_LABELS[mineOnDay.category]}
                          </span>
                        )}
                        {!mineOnDay && canClick && !isWeekendCell && (
                          <span
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/45 bg-white/35 text-slate-600 shadow-sm"
                            aria-hidden="true"
                          >
                            <Plus className="h-3 w-3" />
                          </span>
                        )}
                      </div>

                      {mineOnDay && colors && !isWeekendCell && (
                        <div
                          className="mt-2 w-full rounded-lg px-2 py-1.5 h-full flex flex-col justify-between"
                          style={{
                            background: showsDisabledVisit ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.38)",
                            border: showsDisabledVisit
                              ? "1px dashed rgba(100,116,139,0.28)"
                              : "1px solid rgba(255,255,255,0.45)",
                            boxShadow: showsDisabledVisit
                              ? "inset 0 1px 0 rgba(255,255,255,0.22)"
                              : "inset 0 1px 0 rgba(255,255,255,0.35)",
                          }}
                        >
                          <div className="flex items-center gap-1 mb-1">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: colors.dot, opacity: showsDisabledVisit ? 0.65 : 1 }}
                            />
                            <span
                              className={`text-[10px] font-semibold line-clamp-2 font-sans ${
                                showsDisabledVisit ? "text-slate-500" : "text-slate-700"
                              }`}
                            >
                              {mineOnDay.title}
                            </span>
                          </div>
                          {mineOnDay.time && (
                            <div className={`flex items-center gap-1 self-end ${showsDisabledVisit ? "text-slate-600" : "text-slate-700"}`}>
                              <Clock3 className="w-2.5 h-2.5 shrink-0" />
                              <span className="text-[12px] font-sans font-semibold">{mineOnDay.time}</span>
                            </div>
                          )}
                          {/* {isPast && (
                            <span className="mt-2 text-[9px] sm:text-[10px] leading-tight text-slate-500 font-sans">
                              termin minął
                            </span>
                          )} */}
                        </div>
                      )}

                      {!mineOnDay && disabledReason === "week_limit" && !isCalendarDisabled && (
                        <span className="mt-auto text-[9px] sm:text-[10px] leading-tight text-slate-600  font-sans">
                          maks. 1 wizyta w tygodniu
                        </span>
                      )}

                      {!mineOnDay && disabledReason === "month_limit" && !isCalendarDisabled && (
                        <span className="mt-auto text-[9px] sm:text-[10px] leading-tight text-slate-600 font-semibold font-sans">
                          limit 4 wizyt w miesiącu
                        </span>
                      )}

                      {!mineOnDay && disabledReason === "blocked" && !isCalendarDisabled && (
                        <span className="mt-auto text-[9px] sm:text-[10px] leading-tight text-rose-600 font-semibold font-sans">
                          dzień niedostępny
                        </span>
                      )}

                      {!mineOnDay && disabledReason === "no_slots" && !isCalendarDisabled && (
                        <span className="mt-auto text-[9px] sm:text-[10px] leading-tight text-rose-600 font-semibold font-sans">
                          brak wolnych terminów
                        </span>
                      )}
                    </>
                  )

                  const cell = canClick ? (
                    <button
                      type="button"
                      data-testid={`calendar-day-${dateStr}`}
                      onClick={() => openDay(day)}
                      style={cellStyle}
                      className={cellClass}
                      title={mineOnDay ? "Edytuj wizytę" : "Dodaj wizytę"}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div
                      data-testid={`calendar-day-${dateStr}`}
                      role="gridcell"
                      aria-disabled="true"
                      style={cellStyle}
                      className={cellClass}
                      title={disabledReason === "week_limit" ? "Maks. 1 wizyta w tygodniu" : undefined}
                    >
                      {inner}
                    </div>
                  )

                  return (
                    <div
                      key={dateStr}
                      className="self-stretch"
                      style={{ flex: isWeekendCell ? "0 0 36px" : "1 1 0" }}
                    >
                      {cell}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {sortedMeetings.length > 0 && (
          <section className="mt-6 max-w-5xl mx-auto">
            <h3 className="text-sm font-bold text-slate-800 font-sans mb-2">Lista wizyt</h3>
            <ul className="flex flex-col gap-2">
              {sortedMeetings.map((m) => {
                const colors = CATEGORY_COLORS[m.category]
                const visitDate = format(meetingDateLocal(m.date), "EEEE, d MMMM yyyy", { locale: pl })
                return (
                <li
                  key={m.id}
                  className="rounded-2xl px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                  style={{
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.4)",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: colors.dot }}
                      />
                      <div className="text-sm font-semibold text-slate-800">{m.title}</div>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold font-sans"
                        style={{
                          background: "rgba(255,255,255,0.45)",
                          border: `1px solid ${colors.border}`,
                          color: colors.dot,
                        }}
                      >
                        {CATEGORY_LABELS[m.category] ?? m.category}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-stretch gap-2">
                      <div
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 min-w-[220px] flex-1"
                        style={{
                          background: "rgba(255,255,255,0.68)",
                          border: `1px solid ${colors.border}`,
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
                        }}
                      >
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                          style={{ background: "rgba(255,255,255,0.85)", color: colors.dot }}
                        >
                          <CalendarDays className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-sans">
                            Data wizyty
                          </div>
                          <div className="text-sm font-semibold text-slate-800 leading-tight">{visitDate}</div>
                        </div>
                      </div>
                      {m.time && (
                        <div
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 min-w-[145px]"
                          style={{
                            background: "rgba(255,255,255,0.82)",
                            border: `1px solid ${colors.border}`,
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
                          }}
                        >
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                            style={{ background: "rgba(255,255,255,0.9)", color: colors.dot }}
                          >
                            <Clock3 className="w-4 h-4" />
                          </span>
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-sans">
                              Godzina
                            </div>
                            <div className="text-base font-bold text-slate-800 leading-tight">{m.time}</div>
                          </div>
                        </div>
                      )}
                      {m.duration ? (
                        <div
                          className="inline-flex items-center rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700"
                          style={{
                            background: "rgba(255,255,255,0.45)",
                            border: `1px solid ${colors.border}`,
                          }}
                        >
                          {m.duration} min
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2 self-start">
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
                        setModalDefaultDate(m.date)
                        setShowForm(true)
                      }}
                    >
                      Edytuj
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
                      Usuń
                    </button>
                  </div>
                </li>
              )})}
            </ul>
          </section>
        )}
      </main>

      <footer className="px-4 pb-4 flex justify-between items-center gap-3">
        <button
          onClick={() => setShowDeleteAccount(true)}
          className="px-4 py-3 rounded-xl text-sm font-semibold font-sans text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors"
        >
          Usuń konto
        </button>
        <button
          onClick={() => {
            db.auth.signOut().catch((err: any) => {
              console.error("InstantDB error (guest sign out)", err)
              alert(err?.body?.message ?? err?.message ?? "Nie udało się wylogować.")
            })
          }}
          className="px-4 py-3 rounded-xl text-sm font-semibold font-sans text-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
          style={{
            backgroundColor: "#0C115B",
            boxShadow: "0 4px 16px rgba(12,17,91,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
            border: "1px solid rgba(12,17,91,0.6)",
          }}
        >
          Wyloguj się
        </button>
      </footer>

      {showForm && (
        <AddTaskModal
          key={`${editing?.id ?? "new"}-${modalDefaultDate}`}
          defaultDate={modalDefaultDate}
          defaultTime={editing?.time}
          existingTasks={availabilityMeetings as any}
          daySlots={dynamicDaySlots}
          initialTitle={editing?.title}
          prefillTitle={editing ? undefined : readGuestCachedDisplayName()}
          initialDescription={editing?.description}
          initialCategory={editing?.category}
          editingTaskId={editing?.id}
          disabledDates={unavailableDates}
          adminBlockedSlots={adminBlockedSlots}
          maxBookableDate={maxBookingDate}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
          onAdd={async (payload: {
            title: string
            description?: string
            category: TaskCategory
            date: string
            time?: string
            duration?: number
          }) => {
            if (editing) {
              if (payload.date !== editing.date) {
                const dayCount = relevantMeetings.filter((x) => x.date === payload.date).length
                if (dayCount >= 1) {
                  alert("Masz już wizytę zaplanowaną na ten dzień.")
                  return false
                }
                const weekCount = relevantMeetings.filter(
                  (x) => getWeekKey(x.date) === getWeekKey(payload.date),
                ).length
                if (weekCount >= 1) {
                  alert("Możesz zarezerwować maksymalnie 1 wizytę w tygodniu.")
                  return false
                }
                const mk = getMonthKey(payload.date)
                const monthCount = relevantMeetings.filter((x) => getMonthKey(x.date) === mk).length
                if (monthCount >= 4) {
                  alert("Możesz zarezerwować maksymalnie 4 wizyty w miesiącu kalendarzowym.")
                  return false
                }
              }
              if (
                !(await ensureFreshSlotAvailability(
                  { date: payload.date, time: payload.time },
                  editing.id,
                ))
              ) {
                return false
              }

              const nowIso = new Date().toISOString()
              try {
                await db.transact(
                  db.tx.meetings[editing.id].update({
                    ...payload,
                    status: "confirmed",
                    previousDate: null,
                    previousTime: null,
                    previousDuration: null,
                    changeRequestedAt: null,
                    lastEditedBy: "guest",
                    updatedAt: nowIso,
                  }),
                )

                writeGuestCachedDisplayName(payload.title)
                await refreshAvailability()
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
              } catch (err: any) {
                console.error("InstantDB error (guest edit)", err)
                alert(err?.body?.message ?? err?.message ?? "Nie udało się zaktualizować wizyty.")
                return false
              }
            } else {
              const dayCount = relevantMeetings.filter((x) => x.date === payload.date).length
              if (dayCount >= 1) {
                alert("Masz już wizytę zaplanowaną na ten dzień.")
                return false
              }
              const weekCount = relevantMeetings.filter(
                (x) => getWeekKey(x.date) === getWeekKey(payload.date),
              ).length
              if (weekCount >= 1) {
                alert("Możesz zarezerwować maksymalnie 1 wizytę w tygodniu.")
                return false
              }
              const mk = getMonthKey(payload.date)
              const monthCount = relevantMeetings.filter((x) => getMonthKey(x.date) === mk).length
              if (monthCount >= 4) {
                alert("Możesz zarezerwować maksymalnie 4 wizyty w miesiącu kalendarzowym.")
                return false
              }
              if (
                !(await ensureFreshSlotAvailability({
                  date: payload.date,
                  time: payload.time,
                }))
              ) {
                return false
              }

              const meetingId = id()
              const createdAt = new Date().toISOString()
              try {
                await db.transact([
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

                writeGuestCachedDisplayName(payload.title)
                await refreshAvailability()
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
              } catch (err: any) {
                console.error("InstantDB error (guest create)", err)
                alert(err?.body?.message ?? err?.message ?? "Nie udało się zapisać wizyty.")
                return false
              }
            }
          }}
        />
      )}

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
            aria-label="Potwierdzenie usunięcia"
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
                Czy na pewno chcesz usunąć tę wizytę?
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
                  Nie
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
                  Tak
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      )}

      {showDeleteAccount && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: "rgba(0,0,0,0.2)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{
              background: "rgba(255,255,255,0.90)",
              backdropFilter: "blur(40px) saturate(200%)",
              border: "1px solid rgba(255,255,255,0.7)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.15), inset 0 2px 0 rgba(255,255,255,0.8)",
            }}
          >
            <h2 className="text-slate-800 text-base font-bold font-sans mb-2">Usunąć konto?</h2>
            <p className="text-slate-600 text-sm font-sans leading-relaxed mb-1">
              Twoje konto zostanie trwale usunięte. Wizyty zostaną zachowane w systemie w formie anonimowej.
            </p>
            <p className="text-slate-800 text-xs font-sans leading-relaxed mb-5">Tej operacji nie można cofnąć.</p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => setShowDeleteAccount(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold font-sans text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={handleDeleteAccount}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold font-sans text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingAccount ? "Usuwanie…" : "Tak, usuń konto"}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <button
              onClick={() => setShowThanks(false)}
              className="absolute right-3 top-3 text-slate-500 text-xs hover:text-slate-700"
              aria-label="Zamknij"
            >
              ✕
            </button>

            <h2 className="text-slate-800 text-lg font-bold font-sans">Wizyta dodana</h2>
            <p className="mt-2 text-slate-600 text-sm font-sans">Twoja wizyta została zapisana.</p>

            <div className="mt-4 text-sm text-slate-700 space-y-1 font-sans">
              <div>
                <span className="font-semibold">Imię i nazwisko:</span> {lastCreated.title}
              </div>
              <div>
                <span className="font-semibold">Data i godzina:</span>{" "}
                {format(meetingDateLocal(lastCreated.date), "d MMMM yyyy", { locale: pl })}
                {lastCreated.time ? ` · ${lastCreated.time}` : ""}
              </div>
              <div>
                <span className="font-semibold">Typ:</span> {CATEGORY_LABELS[lastCreated.category] ?? lastCreated.category}
              </div>
              {lastCreated.duration && (
                <div>
                  <span className="font-semibold">Czas trwania:</span> {lastCreated.duration} min
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
