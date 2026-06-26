"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { X } from "lucide-react"
import {
  format,
  addDays,
  addMonths,
  startOfDay,
  isWeekend,
  isBefore,
  isAfter,
  addHours,
  parseISO,
} from "date-fns"
import { pl } from "date-fns/locale"
import type { Task, TaskCategory } from "@/lib/calendar-types"
import {
  CALENDAR_END_HOUR,
  SESSION_DURATION,
  DAY_SLOTS,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "@/lib/calendar-types"
import { resolveSlotsForDate, type ScheduleSlotRecord } from "@/lib/schedule-slots"
import {
  resolveInCabinetWeekdaysForDate,
  type InCabinetDayRecord,
} from "@/lib/in-cabinet-days"
import { getAdminCategoryForDate, getCategoryForDate, isSaturdayDate } from "@/lib/visit-category"
import { generateFiveMinuteTimeOptions, snapTimeToFullHour } from "@/lib/time-options"
import { TimePickerInput } from "@/components/calendar/TimePickerInput"
import { formatPhoneForStorage, isValidPhoneNumber } from "@/lib/phone"

interface AddTaskModalProps {
  defaultDate: string
  defaultTime?: string
  existingTasks: Task[]
  onClose: () => void
  onAdd: (task: {
    title: string
    description?: string
    category: TaskCategory
    date: string
    time?: string
    duration?: number
    email?: string
    phone?: string
  }) => void | boolean | Promise<void | boolean>
  initialTitle?: string
  /** Pre-fills the patient name for a new booking only (e.g. from browser cache). Ignored when `editingTaskId` is set. */
  prefillTitle?: string
  initialDescription?: string
  initialCategory?: TaskCategory
  editingTaskId?: string
  showEmailField?: boolean
  initialEmail?: string
  /** Guest booking: show patient phone number field. */
  showPhoneField?: boolean
  /** When false, phone may be left empty (admin booking). Defaults to true. */
  requirePhone?: boolean
  initialPhone?: string
  /** Pre-fills phone for a new booking only (e.g. from browser cache). Ignored when `editingTaskId` is set. */
  prefillPhone?: string
  /** Versioned schedule from DB — resolved per date. */
  scheduleRecords?: ScheduleSlotRecord[]
  /** @deprecated Use scheduleRecords. Falls back when scheduleRecords is omitted. */
  daySlots?: Record<number, string[]>
  /** Dates the current user is not allowed to book (already has a meeting that day, or weekly cap reached). */
  disabledDates?: Set<string>
  /** Admin-blocked individual slots: date → set of blocked times. */
  adminBlockedSlots?: Map<string, Set<string>>
  /** Last calendar day (inclusive) that can be booked; start-of-day. Defaults to one month from today. */
  maxBookableDate?: Date
  /** When true, category is set from selected date (guest booking). */
  autoCategoryFromDate?: boolean
  /** Versioned in-cabinet weekday settings when autoCategoryFromDate is set. */
  inCabinetDayRecords?: InCabinetDayRecord[]
  /** Admin only: include Saturdays with free-form time input. */
  allowSaturdayDates?: boolean
}

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: "w_gabinecie", label: "W gabinecie" },
  { value: "online",      label: "Online" },
]

type SlotsResolver = (dateStr: string) => string[]

/** True if a 50-min session starting at `time` finishes before the calendar end. */
function fitsInDay(time: string): boolean {
  const [h, m] = time.split(":").map(Number)
  const endMinutes = h * 60 + m + SESSION_DURATION
  return endMinutes <= CALENDAR_END_HOUR * 60
}

/** Generate available dates: up to maxDate; weekdays with slots, optionally Saturdays (admin). */
function generateAvailableDates(
  resolveSlots: SlotsResolver,
  maxDate: Date,
  allowSaturdayDates = false,
): { date: Date; dateStr: string; label: string }[] {
  const today = startOfDay(new Date())
  const dates: { date: Date; dateStr: string; label: string }[] = []

  let current = today
  while (!isAfter(current, maxDate)) {
    const dateStr = format(current, "yyyy-MM-dd")
    const day = current.getDay()
    if (allowSaturdayDates && day === 6) {
      dates.push({
        date: current,
        dateStr,
        label: format(current, "EEE, d MMM", { locale: pl }),
      })
    } else if (!isWeekend(current) && resolveSlots(dateStr).length > 0) {
      dates.push({
        date: current,
        dateStr,
        label: format(current, "EEE, d MMM", { locale: pl }),
      })
    }
    current = addDays(current, 1)
  }

  return dates
}

function resolveCategoryForModal(
  dateStr: string,
  inCabinetWeekdays: number[],
  autoCategoryFromDate: boolean,
  allowSaturdayDates: boolean,
  fallback: TaskCategory,
): TaskCategory {
  if (!autoCategoryFromDate) return fallback
  if (allowSaturdayDates) {
    return getAdminCategoryForDate(dateStr, inCabinetWeekdays)
  }
  return getCategoryForDate(dateStr, inCabinetWeekdays)
}

export function AddTaskModal({
  defaultDate,
  defaultTime,
  existingTasks,
  onClose,
  onAdd,
  initialTitle,
  prefillTitle,
  initialDescription,
  initialCategory,
  editingTaskId,
  showEmailField,
  initialEmail,
  showPhoneField,
  requirePhone = true,
  initialPhone,
  prefillPhone,
  scheduleRecords,
  daySlots,
  disabledDates,
  adminBlockedSlots,
  maxBookableDate: maxBookableDateProp,
  autoCategoryFromDate = false,
  inCabinetDayRecords,
  allowSaturdayDates = false,
}: AddTaskModalProps) {
  const resolveInCabinetWeekdays = useMemo(
    () => (dateStr: string) =>
      resolveInCabinetWeekdaysForDate(dateStr, inCabinetDayRecords ?? []),
    [inCabinetDayRecords],
  )
  const resolveSlots = useMemo<SlotsResolver>(() => {
    if (scheduleRecords) {
      return (dateStr: string) => resolveSlotsForDate(dateStr, scheduleRecords)
    }
    const legacy = daySlots ?? DAY_SLOTS
    return (dateStr: string) => legacy[parseISO(dateStr).getDay()] ?? []
  }, [scheduleRecords, daySlots])
  const isEditing = Boolean(editingTaskId)
  const now = useMemo(() => new Date(), [])
  const today = useMemo(() => startOfDay(now), [now])
  const maxBookingDate = useMemo(
    () => (maxBookableDateProp ? startOfDay(maxBookableDateProp) : addMonths(today, 1)),
    [today, maxBookableDateProp],
  )
  const availableDates = useMemo(
    () =>
      generateAvailableDates(resolveSlots, maxBookingDate, allowSaturdayDates).filter(
        (d) => !disabledDates?.has(d.dateStr),
      ),
    [resolveSlots, maxBookingDate, disabledDates, allowSaturdayDates],
  )

  const isSlotWithinBookingWindow = (dateStr: string, slot: string) => {
    const [h, m] = slot.split(":").map(Number)
    const date = parseISO(dateStr)
    const slotDateTime = new Date(date)
    slotDateTime.setHours(h, m, 0, 0)
    const minBookingDateTime = addHours(now, 2)
    if (isBefore(slotDateTime, minBookingDateTime)) return false
    if (isAfter(startOfDay(date), maxBookingDate)) return false
    return true
  }

  // Two 50-min sessions conflict if their start times are identical (slots are spaced >50 min apart)
  const isSlotConflicting = (startSlot: string, blocked: Set<string>) => {
    return blocked.has(startSlot)
  }

  const isAdminSlotBlocked = (dateStr: string, slot: string) =>
    adminBlockedSlots?.get(dateStr)?.has(slot) ?? false

  // Ensure default date is valid (weekday within range)
  const validDefaultDate = useMemo(() => {
    const found = availableDates.find((d) => d.dateStr === defaultDate)
    if (found) return defaultDate
    if (
      allowSaturdayDates &&
      isSaturdayDate(defaultDate) &&
      !isAfter(startOfDay(parseISO(defaultDate)), maxBookingDate)
    ) {
      return defaultDate
    }
    return availableDates[0]?.dateStr ?? defaultDate
  }, [defaultDate, availableDates, allowSaturdayDates, maxBookingDate])

  const [title, setTitle] = useState(() => (initialTitle ?? prefillTitle ?? "").trim())
  const [description, setDescription] = useState(initialDescription ?? "")
  const [category, setCategory] = useState<TaskCategory>(() =>
    resolveCategoryForModal(
      validDefaultDate,
      resolveInCabinetWeekdays(validDefaultDate),
      autoCategoryFromDate,
      allowSaturdayDates,
      initialCategory ?? "w_gabinecie",
    ),
  )
  const [selectedDate, setSelectedDate] = useState(validDefaultDate)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [email, setEmail] = useState(initialEmail ?? "")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [phone, setPhone] = useState(() => (initialPhone ?? prefillPhone ?? "").trim())
  const [phoneError, setPhoneError] = useState<string | null>(null)

  // Initialise time: prefer defaultTime if it's a valid slot for the date, else pick first slot
  const [time, setTime] = useState(() => {
    if (allowSaturdayDates && isSaturdayDate(validDefaultDate)) {
      return defaultTime ? snapTimeToFullHour(defaultTime) : ""
    }
    const dayTimeSlots = resolveSlots(validDefaultDate)
    if (defaultTime && dayTimeSlots.includes(defaultTime)) return defaultTime
    return dayTimeSlots[0] ?? ""
  })

  const isSaturdaySelected = isSaturdayDate(selectedDate)

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  // blocked start times per date (exact meeting start times of other sessions)
  const blockedSlotsByDate = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const dateStrs = new Set(availableDates.map((d) => d.dateStr))
    if (allowSaturdayDates && isSaturdayDate(selectedDate)) {
      dateStrs.add(selectedDate)
    }
    for (const dateStr of dateStrs) {
      const blocked = new Set<string>()
      existingTasks
        .filter((t) => t.date === dateStr)
        .filter((t) => {
          if (!isEditing || !editingTaskId) return true
          return t.id !== editingTaskId
        })
        .forEach((task) => {
          if (task.time) blocked.add(task.time)
        })
      map.set(dateStr, blocked)
    }
    return map
  }, [availableDates, existingTasks, isEditing, editingTaskId, allowSaturdayDates, selectedDate])

  const blockedSlots = blockedSlotsByDate.get(selectedDate) ?? new Set<string>()
  const allSlotsForSelectedDate = useMemo(
    () => (selectedDate ? resolveSlots(selectedDate) : []),
    [selectedDate, resolveSlots],
  )

  const freeSlotsByDate = useMemo(() => {
    const map = new Map<string, string[]>()

    for (const { dateStr } of availableDates) {
      const blocked = blockedSlotsByDate.get(dateStr) ?? new Set<string>()
      const freeSlots = resolveSlots(dateStr).filter(
        (slot) =>
          isSlotWithinBookingWindow(dateStr, slot) &&
          fitsInDay(slot) &&
          !isSlotConflicting(slot, blocked) &&
          !isAdminSlotBlocked(dateStr, slot),
      )

      map.set(dateStr, freeSlots)
    }

    return map
  }, [availableDates, blockedSlotsByDate, resolveSlots, adminBlockedSlots, now, maxBookingDate])

  const freeSlotsForSelectedDate = freeSlotsByDate.get(selectedDate) ?? []
  const hasFreeSlotsForSelectedDate = freeSlotsForSelectedDate.length > 0

  const saturdayTimeOptions = useMemo(() => generateFiveMinuteTimeOptions(), [])

  const freeSaturdaySlots = useMemo(() => {
    if (!isSaturdaySelected) return []
    const blocked = blockedSlotsByDate.get(selectedDate) ?? new Set<string>()
    return saturdayTimeOptions.filter(
      (slot) =>
        fitsInDay(slot) &&
        isSlotWithinBookingWindow(selectedDate, slot) &&
        !isAdminSlotBlocked(selectedDate, slot) &&
        !isSlotConflicting(slot, blocked),
    )
  }, [
    isSaturdaySelected,
    selectedDate,
    saturdayTimeOptions,
    blockedSlotsByDate,
    now,
    maxBookingDate,
    adminBlockedSlots,
  ])

  const isSaturdayTimeValid = useMemo(() => {
    if (!isSaturdaySelected || !time) return false
    if (!fitsInDay(time)) return false
    if (!isSlotWithinBookingWindow(selectedDate, time)) return false
    if (isAdminSlotBlocked(selectedDate, time)) return false
    if (isSlotConflicting(time, blockedSlots)) return false
    return true
  }, [isSaturdaySelected, time, selectedDate, blockedSlots, now, maxBookingDate, adminBlockedSlots])

  const canSubmitTime = isSaturdaySelected ? isSaturdayTimeValid : hasFreeSlotsForSelectedDate

  // Auto-prefill date+time when opening a new booking: prefer calendar-chosen day, else first available.
  const didInitialPrefill = useRef(false)
  useEffect(() => {
    if (isEditing) return
    if (defaultTime) return
    if (didInitialPrefill.current) return

    if (allowSaturdayDates && isSaturdayDate(defaultDate)) {
      setSelectedDate(defaultDate)
      const firstFree = saturdayTimeOptions.find(
        (slot) =>
          fitsInDay(slot) &&
          isSlotWithinBookingWindow(defaultDate, slot) &&
          !isAdminSlotBlocked(defaultDate, slot) &&
          !isSlotConflicting(
            slot,
            blockedSlotsByDate.get(defaultDate) ?? new Set<string>(),
          ),
      )
      if (firstFree) setTime(firstFree)
      didInitialPrefill.current = true
      return
    }

    const tryPrefillDate = (dateStr: string): boolean => {
      const freeSlots = freeSlotsByDate.get(dateStr) ?? []
      const nextSlot = freeSlots[0]
      if (!nextSlot) return false
      setSelectedDate(dateStr)
      setTime(nextSlot)
      return true
    }

    const chosenInList = availableDates.some((d) => d.dateStr === defaultDate)
    if (chosenInList && tryPrefillDate(defaultDate)) {
      didInitialPrefill.current = true
      return
    }

    for (const { dateStr } of availableDates) {
      if (tryPrefillDate(dateStr)) {
        didInitialPrefill.current = true
        return
      }
    }
    didInitialPrefill.current = true
  }, [isEditing, defaultTime, defaultDate, availableDates, freeSlotsByDate, allowSaturdayDates, saturdayTimeOptions, blockedSlotsByDate])

  // When date changes, validate current time is still a valid slot for the new day
  const prevSelectedDateRef = useRef<string | null>(null)
  useEffect(() => {
    if (isEditing) return
    if (!selectedDate) return

    const dateChanged =
      prevSelectedDateRef.current !== null && prevSelectedDateRef.current !== selectedDate
    prevSelectedDateRef.current = selectedDate
    if (!dateChanged) return

    if (allowSaturdayDates && isSaturdayDate(selectedDate)) {
      if (time && freeSaturdaySlots.includes(time)) return
      setTime(freeSaturdaySlots[0] ?? "")
      return
    }

    if (!freeSlotsForSelectedDate.length) {
      if (time !== "") setTime("")
      return
    }

    if (time && freeSlotsForSelectedDate.includes(time)) return

    setTime(freeSlotsForSelectedDate[0] ?? "")
  }, [selectedDate, isEditing, freeSlotsForSelectedDate, freeSaturdaySlots, time, allowSaturdayDates])

  useEffect(() => {
    if (!autoCategoryFromDate || !selectedDate) return
    setCategory(
      resolveCategoryForModal(
        selectedDate,
        resolveInCabinetWeekdays(selectedDate),
        autoCategoryFromDate,
        allowSaturdayDates,
        "online",
      ),
    )
  }, [autoCategoryFromDate, selectedDate, resolveInCabinetWeekdays, allowSaturdayDates])

  const dateSelectOptions = useMemo(() => {
    const options = [...availableDates]
    if (
      allowSaturdayDates &&
      selectedDate &&
      !options.some((d) => d.dateStr === selectedDate)
    ) {
      const d = parseISO(selectedDate)
      options.push({
        date: d,
        dateStr: selectedDate,
        label: format(d, "EEE, d MMM", { locale: pl }),
      })
      options.sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    }
    return options
  }, [availableDates, allowSaturdayDates, selectedDate])

  const wouldConflict = useMemo(() => {
    if (!time) return false
    return isSlotConflicting(time, blockedSlots)
  }, [time, blockedSlots])

  const dateEnabledMap = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const { dateStr } of availableDates) {
      if (allowSaturdayDates && isSaturdayDate(dateStr)) {
        map.set(dateStr, true)
      } else {
        map.set(dateStr, (freeSlotsByDate.get(dateStr) ?? []).length > 0)
      }
    }
    if (allowSaturdayDates && selectedDate && isSaturdayDate(selectedDate)) {
      map.set(selectedDate, true)
    }
    return map
  }, [availableDates, freeSlotsByDate, allowSaturdayDates, selectedDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!title.trim()) {
      setNameError("Proszę wpisać imię i nazwisko pacjenta.")
      return
    }

    if (showEmailField) {
      const trimmed = email.trim()
      if (!trimmed) {
        setEmailError("Proszę wpisać email pacjenta.")
        return
      }
      if (!isValidEmail(trimmed)) {
        setEmailError("Proszę wpisać poprawny email pacjenta.")
        return
      }
    }

    if (showPhoneField) {
      const trimmed = phone.trim()
      if (!trimmed && requirePhone) {
        setPhoneError("Proszę wpisać numer telefonu.")
        return
      }
      if (trimmed && !isValidPhoneNumber(trimmed)) {
        setPhoneError("Proszę wpisać poprawny numer telefonu (Polska lub Belgia, np. +48… lub +32…).")
        return
      }
    }

    if (!time) {
      alert("Proszę wybrać godzinę wizyty.")
      return
    }

    if (!fitsInDay(time)) {
      alert(`Wizyta kończy się po ${CALENDAR_END_HOUR}:00. Proszę wybrać wcześniejszą godzinę.`)
      return
    }

    if (!canSubmitTime) {
      alert(
        isSaturdaySelected
          ? "Wybrana godzina jest niedostępna lub koliduje z inną wizytą."
          : "Brak wolnych terminów w tym dniu.",
      )
      return
    }

    if (!isEditing && wouldConflict) {
      alert("Ten termin jest już zarezerwowany. Proszę wybrać inny termin.")
      return
    }
    setIsSubmitting(true)
    setNameError(null)
    setEmailError(null)
    setPhoneError(null)
    const resolvedCategory = resolveCategoryForModal(
      selectedDate,
      resolveInCabinetWeekdays(selectedDate),
      autoCategoryFromDate,
      allowSaturdayDates,
      category,
    )
    let result: void | boolean
    try {
      result = await onAdd({
        title: title.trim(),
        description: description.trim() || undefined,
        category: resolvedCategory,
        date: selectedDate,
        time: time || undefined,
        duration: SESSION_DURATION,
        email: showEmailField ? email.trim() : undefined,
        phone:
          showPhoneField && phone.trim()
            ? formatPhoneForStorage(phone.trim())
            : undefined,
      })
    } catch {
      setIsSubmitting(false)
      return
    }

    if (result === false) {
      setIsSubmitting(false)
      return
    }

    onClose()
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.55)",
    border: "1px solid rgba(0,0,0,0.1)",
    backdropFilter: "blur(10px)",
    color: "#1e293b",
    outline: "none",
  }

  useEffect(() => {
    const scrollY = window.scrollY
    const { body } = document
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    }
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    body.style.overflow = "hidden"
    body.style.position = "fixed"
    body.style.top = `-${scrollY}px`
    body.style.width = "100%"
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      body.style.overflow = prev.overflow
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.width = prev.width
      body.style.paddingRight = prev.paddingRight
      window.scrollTo(0, scrollY)
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain"
      style={{ background: "rgba(0,0,0,0.2)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-4 sm:p-6 shadow-2xl max-h-[min(90vh,100%)] overflow-y-auto overscroll-contain my-auto"
        style={{
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(40px) saturate(200%)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.15), inset 0 2px 0 rgba(255,255,255,0.8)",
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-slate-800 text-lg font-bold font-sans">
            {isEditing ? "Edytuj wizytę" : "Nowa wizyta"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            aria-label="Zamknij"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div>
            <label
              htmlFor="task-title"
              className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide"
            >
              Imię i nazwisko pacjenta
            </label>
            <input
              id="task-title"
              name="title"
              autoFocus
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (nameError) setNameError(null)
              }}
              placeholder="e.g. Anna Kowalska"
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 focus:border-slate-300 transition-colors"
              style={inputStyle}
            />
            {nameError && (
              <p className="mt-1 text-[11px] text-red-600 font-sans">
                {nameError}
              </p>
            )}
          </div>

          {showEmailField && (
            <div>
              <label
                htmlFor="task-email"
                className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide"
              >
                Email
              </label>
              <input
                id="task-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) setEmailError(null)
                }}
                placeholder="imie.nazwisko@poczta.com"
                className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 focus:border-slate-300 transition-colors"
                style={inputStyle}
              />
              {emailError && (
                <p className="mt-1 text-[11px] text-red-600 font-sans">
                  {emailError}
                </p>
              )}
            </div>
          )}

          {showPhoneField && (
            <div>
              <label
                htmlFor="task-phone"
                className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide"
              >
                Numer telefonu{" "}
                {!requirePhone && (
                  <span className="normal-case font-normal text-slate-600">(opcjonalnie)</span>
                )}
              </label>
              <input
                id="task-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  if (phoneError) setPhoneError(null)
                }}
                placeholder="np. +48 500 123 456 lub 0470 12 34 56"
                className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 focus:border-slate-300 transition-colors"
                style={inputStyle}
              />
              {phoneError && (
                <p className="mt-1 text-[11px] text-red-600 font-sans">
                  {phoneError}
                </p>
              )}
            </div>
          )}

          {/* Date selector */}
          <div>
            <label
              htmlFor="task-date"
              className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide"
            >
              Data {allowSaturdayDates ? "(dni robocze i sobota)" : "(dni robocze)"}
            </label>
            <select
              id="task-date"
              name="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans cursor-pointer"
              style={{ ...inputStyle, WebkitAppearance: "none" }}
            >
              {dateSelectOptions.map(({ dateStr, label }) => (
                <option key={dateStr} value={dateStr} disabled={!dateEnabledMap.get(dateStr)}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Time selector */}
          <div>
            <label
              htmlFor="task-time"
              className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide"
            >
              Godzina <span className="normal-case font-normal text-slate-600">(wizyta 50-min)</span>
            </label>
            {isSaturdaySelected && allowSaturdayDates ? (
              <TimePickerInput
                id="task-time"
                name="time"
                value={time}
                onChange={setTime}
                inputStyle={inputStyle}
                availableTimes={new Set(freeSaturdaySlots)}
              />
            ) : (
            <select
              id="task-time"
              name="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
              style={{ ...inputStyle, WebkitAppearance: "none" }}
            >
              {!time && (
                <option value="" disabled>
                  Wybierz godzinę
                </option>
              )}
              {allSlotsForSelectedDate.map((slot) => {
                const isAvailable = freeSlotsForSelectedDate.includes(slot)
                return (
                <option key={slot} value={slot} disabled={!isAvailable}>
                  {isAvailable ? slot : `${slot} (niedostępny)`}
                </option>
                )
              })}
            </select>
            )}
            {isSaturdaySelected && allowSaturdayDates && time && !isSaturdayTimeValid && (
              <div
                className="mt-2 px-3 py-2 rounded-lg text-xs font-semibold font-sans"
                style={{
                  background: "rgba(254,226,226,0.25)",
                  border: "1.5px dashed rgba(239,68,68,0.3)",
                  color: "#b91c1c",
                }}
              >
                godzina niedostępna lub koliduje z inną wizytą
              </div>
            )}
            {!isSaturdaySelected && !hasFreeSlotsForSelectedDate && (
              <div
                className="mt-2 px-3 py-2 rounded-lg text-xs font-semibold font-sans"
                style={{
                  background: "rgba(254,226,226,0.25)",
                  border: "1.5px dashed rgba(239,68,68,0.3)",
                  color: "#b91c1c",
                }}
              >
                brak wolnych terminów
              </div>
            )}
          </div>

          {/* Conflict warning (only when creating a new session) */}
          {!isEditing && wouldConflict && (
            <div
              className="px-3 py-2 rounded-lg text-xs font-sans"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#991b1b",
              }}
            >
             Ten termin jest już zarezerwowany. Wybierz inny termin.
            </div>
          )}

          {/* Session type */}
          <div>
            <label className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
              Typ wizyty
            </label>
            {autoCategoryFromDate ? (
              <div>
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-sans"
                  style={{
                    background: CATEGORY_COLORS[category].bg,
                    border: `1px solid ${CATEGORY_COLORS[category].border}`,
                    color: CATEGORY_COLORS[category].dot,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[category].dot }}
                  />
                  {CATEGORY_LABELS[category]}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 font-sans leading-relaxed">
                  {isSaturdaySelected && allowSaturdayDates
                    ? "Sobota — wizyta online (wyjątkowa)."
                    : "Ustalane automatycznie na podstawie wybranej daty."}
                </p>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map((cat) => {
                  const colors = CATEGORY_COLORS[cat.value]
                  const isSelected = category === cat.value
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all duration-150 flex items-center gap-1.5"
                      style={{
                        background: isSelected ? colors.bg : "rgba(0,0,0,0.05)",
                        border: isSelected ? `1px solid ${colors.border}` : "1px solid rgba(0,0,0,0.1)",
                        color: isSelected ? colors.dot : "#64748b",
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: colors.dot }}
                      />
                      {cat.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="task-description"
              className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide"
            >
              Notatki
            </label>
            <textarea
              id="task-description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opis dodatkowy..."
              rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 resize-none"
              style={inputStyle}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={(!isEditing && wouldConflict) || isSubmitting || !canSubmitTime}
            className="w-full py-3 rounded-xl font-bold font-sans text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            style={{
              backgroundColor: "#0C115B",
              color: "white",
              boxShadow: "0 8px 24px rgba(12,17,91,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
              border: "1px solid rgba(12,17,91,0.6)",
            }}
          >
            {isSubmitting
              ? (isEditing ? "Zapisywanie..." : "Rezerwowanie...")
              : isEditing ? "Zapisz zmiany" : "Rezerwuj wizytę"}
          </button>
        </form>
      </div>
    </div>
  )
}
