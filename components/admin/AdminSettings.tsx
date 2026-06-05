"use client"

import { useMemo, useState } from "react"
import { eachDayOfInterval, format, parseISO } from "date-fns"
import { pl } from "date-fns/locale"
import { ChevronLeft, Plus, X, CalendarDays, Users, Ban } from "lucide-react"
import { id } from "@instantdb/react"
import { db } from "@/lib/db"
import {
  findScheduleVersionId,
  getNextScheduleEffectiveFrom,
  resolveSlotsForDate,
  resolveSlotsForWeekdayAtEffectiveFrom,
  type ScheduleSlotRecord,
} from "@/lib/schedule-slots"
import {
  findInCabinetDaysVersionId,
  resolveInCabinetWeekdaysAtEffectiveFrom,
  type InCabinetDayRecord,
} from "@/lib/in-cabinet-days"
import { WORK_WEEKDAYS } from "@/lib/visit-category"

interface AdminSettingsProps {
  onBack: () => void
}

type UserRecord = { id: string; email: string; createdAt: string }
type BlockedDateRecord = { id: string; date: string; reason?: string }
type BlockedSlotRecord = { id: string; date: string; time: string }
type BookingSettingsRecord = InCabinetDayRecord & { id: string }

const glassCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  backdropFilter: "blur(20px) saturate(180%)",
  border: "1px solid rgba(255,255,255,0.5)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
}

export function AdminSettings({ onBack }: AdminSettingsProps) {
  const { data: scheduleData } = db.useQuery({ scheduleSlots: {} })
  const { data: usersData } = db.useQuery({ allowedUsers: {} })
  const { data: blockedData } = db.useQuery({ blockedDates: {} })
  const { data: blockedSlotsData } = db.useQuery({ blockedSlots: {} })
  const { data: bookingSettingsData } = db.useQuery({ bookingSettings: {} })

  const slotRecords = useMemo(
    () => (scheduleData?.scheduleSlots ?? []) as ScheduleSlotRecord[],
    [scheduleData],
  )
  const scheduleEditEffectiveFrom = useMemo(() => getNextScheduleEffectiveFrom(), [])
  const scheduleEditEffectiveLabel = useMemo(
    () => format(parseISO(scheduleEditEffectiveFrom), "d MMMM yyyy", { locale: pl }),
    [scheduleEditEffectiveFrom],
  )

  const inCabinetDayRecords = useMemo(
    () => (bookingSettingsData?.bookingSettings ?? []) as BookingSettingsRecord[],
    [bookingSettingsData],
  )
  const cabinetEditEffectiveFrom = scheduleEditEffectiveFrom
  const cabinetEditEffectiveLabel = scheduleEditEffectiveLabel

  const getInCabinetWeekdaysForEdit = (): number[] =>
    resolveInCabinetWeekdaysAtEffectiveFrom(cabinetEditEffectiveFrom, inCabinetDayRecords)

  const saveInCabinetWeekdays = (weekdays: number[]) => {
    const existingId = findInCabinetDaysVersionId(cabinetEditEffectiveFrom, inCabinetDayRecords)
    const payload = {
      inCabinetWeekdays: JSON.stringify(weekdays.slice().sort()),
      effectiveFrom: cabinetEditEffectiveFrom,
    }
    if (existingId) {
      db.transact((db.tx.bookingSettings as any)[existingId].update(payload))
    } else {
      db.transact((db.tx.bookingSettings as any)[id()].create(payload))
    }
  }

  const toggleInCabinetWeekday = (day: number) => {
    const current = getInCabinetWeekdaysForEdit()
    if (current.includes(day)) {
      saveInCabinetWeekdays(current.filter((d) => d !== day))
    } else {
      saveInCabinetWeekdays([...current, day])
    }
  }
  const allowedUsers = useMemo(
    () => (usersData?.allowedUsers ?? []) as UserRecord[],
    [usersData],
  )
  const blockedDates = useMemo(
    () => (blockedData?.blockedDates ?? []) as BlockedDateRecord[],
    [blockedData],
  )
  const blockedSlotRecords = useMemo(
    () => (blockedSlotsData?.blockedSlots ?? []) as BlockedSlotRecord[],
    [blockedSlotsData],
  )
  // date → Set<time>
  const blockedSlotMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const r of blockedSlotRecords) {
      if (!map.has(r.date)) map.set(r.date, new Set())
      map.get(r.date)!.add(r.time)
    }
    return map
  }, [blockedSlotRecords])

  const getSlotsForDay = (day: number): string[] =>
    resolveSlotsForWeekdayAtEffectiveFrom(day, scheduleEditEffectiveFrom, slotRecords)

  // --- Schedule editing ---
  const [newTime, setNewTime] = useState<Record<number, string>>({})

  const saveSlots = (day: number, slots: string[]) => {
    const existingId = findScheduleVersionId(day, scheduleEditEffectiveFrom, slotRecords)
    const payload = {
      day,
      slots: JSON.stringify(slots.slice().sort()),
      effectiveFrom: scheduleEditEffectiveFrom,
    }
    if (existingId) {
      db.transact((db.tx.scheduleSlots as any)[existingId].update(payload))
    } else {
      db.transact((db.tx.scheduleSlots as any)[id()].create(payload))
    }
  }

  const addSlot = (day: number) => {
    const t = newTime[day]?.trim()
    if (!t) return
    const current = getSlotsForDay(day)
    if (current.includes(t)) return
    saveSlots(day, [...current, t])
    setNewTime((p) => ({ ...p, [day]: "" }))
  }

  const removeSlot = (day: number, time: string) => {
    saveSlots(
      day,
      getSlotsForDay(day).filter((t) => t !== time),
    )
  }

  // --- Allowed users ---
  const [newEmail, setNewEmail] = useState("")
  const [emailError, setEmailError] = useState("")

  const addUser = () => {
    const email = newEmail.trim().toLowerCase()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Nieprawidłowy adres e-mail")
      return
    }
    if (allowedUsers.some((u) => u.email.toLowerCase() === email)) {
      setEmailError("Ten adres jest już na liście")
      return
    }
    db.transact(
      (db.tx.allowedUsers as any)[id()].create({ email, createdAt: new Date().toISOString() }),
    )
    setNewEmail("")
    setEmailError("")
  }

  const removeUser = (userId: string) => {
    db.transact((db.tx.allowedUsers as any)[userId].delete())
  }

  // --- Blocked slots (specific time on a specific date) ---
  const [slotBlockDate, setSlotBlockDate] = useState("")

  const slotsForBlockDate = useMemo(() => {
    if (!slotBlockDate) return []
    return resolveSlotsForDate(slotBlockDate, slotRecords)
  }, [slotBlockDate, slotRecords])

  const toggleBlockedSlot = (date: string, time: string) => {
    const isCurrentlyBlocked = blockedSlotMap.get(date)?.has(time)
    if (isCurrentlyBlocked) {
      const record = blockedSlotRecords.find((r) => r.date === date && r.time === time)
      if (record) db.transact((db.tx.blockedSlots as any)[record.id].delete())
    } else {
      db.transact((db.tx.blockedSlots as any)[id()].create({ date, time }))
    }
  }

  // --- Blocked dates ---
  const [newBlockedDateFrom, setNewBlockedDateFrom] = useState("")
  const [newBlockedDateTo, setNewBlockedDateTo] = useState("")
  const [newBlockedReason, setNewBlockedReason] = useState("")
  const [blockedDateError, setBlockedDateError] = useState("")

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const addBlockedDate = () => {
    const from = newBlockedDateFrom.trim()
    if (!from) return
    const to = newBlockedDateTo.trim() || from
    if (to < from) {
      setBlockedDateError("Data końcowa musi być taka sama lub późniejsza niż początkowa")
      return
    }

    const datesInRange = eachDayOfInterval({
      start: parseISO(from),
      end: parseISO(to),
    }).map((d) => format(d, "yyyy-MM-dd"))

    const existing = new Set(blockedDates.map((b) => b.date))
    const toCreate = datesInRange.filter((d) => !existing.has(d))
    if (toCreate.length === 0) {
      setBlockedDateError("Wybrane dni są już zablokowane")
      return
    }

    const reason = newBlockedReason.trim()
    db.transact(
      toCreate.map((date) =>
        (db.tx.blockedDates as any)[id()].create({
          date,
          ...(reason ? { reason } : {}),
        }),
      ),
    )
    setNewBlockedDateFrom("")
    setNewBlockedDateTo("")
    setNewBlockedReason("")
    setBlockedDateError("")
  }

  const removeBlockedDate = (recordId: string) => {
    db.transact((db.tx.blockedDates as any)[recordId].delete())
  }

  /** Format "YYYY-MM-DD" → e.g. "śr, 21 maj 2026" */
  const formatDate = (dateStr: string): string => {
    try {
      return new Date(dateStr + "T12:00:00").toLocaleDateString("pl-PL", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    } catch {
      return dateStr
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.55)",
    border: "1px solid rgba(0,0,0,0.1)",
    backdropFilter: "blur(10px)",
    color: "#1e293b",
    outline: "none",
  }

  return (
    <div className="relative min-h-screen flex flex-col before:content-[''] before:absolute before:inset-0 before:bg-[url('/images/rose-bg.jpeg')] before:bg-cover before:bg-center before:opacity-80 before:z-[-1]">
      {/* Header */}
      <header className="relative z-10 px-6 pt-6 pb-4 flex-shrink-0">
        <div
          className="max-w-full mx-auto rounded-2xl px-5 py-3.5 flex flex-col gap-3"
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
              <h1 className="text-slate-800 font-bold text-lg font-sans leading-tight">
                Ustawienia administracyjne
              </h1>
              <p className="text-slate-800 text-xs font-sans">Harmonogram i uprawnieni użytkownicy</p>
            </div>
          </div>

          <button
            onClick={onBack}
            className="self-start flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold font-sans text-sm text-slate-700 transition-all duration-200 hover:bg-white/50"
            style={{ border: "1px solid rgba(0,0,0,0.1)" }}
          >
            <ChevronLeft className="w-4 h-4" />
            Kalendarz
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-6 pb-8 overflow-auto">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-6xl mx-auto">

          {/* ── Allowed Users ─────────────────────────────── */}
          <section className="rounded-2xl p-5" style={glassCard}>
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-slate-600" />
              <h2 className="text-slate-800 font-bold font-sans">Uprawnieni użytkownicy</h2>
            </div>
            <p className="text-slate-800 text-xs font-sans mb-4 leading-relaxed">
              Tylko te adresy e-mail mogą rezerwować wizyty.
            </p>

            {/* Add email */}
            <div className="flex gap-2 mb-3">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setEmailError("") }}
                onKeyDown={(e) => e.key === "Enter" && addUser()}
                placeholder="email@example.com"
                className="flex-1 rounded-xl px-3 py-2 text-sm font-sans placeholder:text-slate-600 transition-colors"
                style={inputStyle}
              />
              <button
                onClick={addUser}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-semibold font-sans text-white transition-all hover:-translate-y-0.5"
                style={{ backgroundColor: "#0C115B", border: "1px solid rgba(12,17,91,0.6)" }}
              >
                <Plus className="w-3.5 h-3.5" />
                Dodaj
              </button>
            </div>
            {emailError && (
              <p className="text-red-500 text-xs font-sans mb-2">{emailError}</p>
            )}

            {/* User list */}
            {allowedUsers.length === 0 ? (
              <p className="text-slate-600 text-xs font-sans italic py-3 text-center">
                Brak ograniczeń — wszyscy mogą rezerwować
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {allowedUsers
                  .slice()
                  .sort((a, b) => a.email.localeCompare(b.email))
                  .map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center justify-between rounded-xl px-3 py-2"
                      style={{
                        background: "rgba(255,255,255,0.5)",
                        border: "1px solid rgba(0,0,0,0.07)",
                      }}
                    >
                      <span className="text-slate-700 text-sm font-sans truncate">{u.email}</span>
                      <button
                        onClick={() => removeUser(u.id)}
                        className="ml-2 flex-shrink-0 p-1 rounded-lg text-slate-800 hover:text-red-500 hover:bg-red-50 transition-colors"
                        aria-label={`Usuń ${u.email}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {/* ── Schedule ──────────────────────────────────── */}
          <section className="rounded-2xl p-5" style={glassCard}>
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-4 h-4 text-slate-600" />
              <h2 className="text-slate-800 font-bold font-sans">Harmonogram wizyt</h2>
            </div>
            <p className="text-slate-800 text-xs font-sans mb-2 leading-relaxed">
              Godziny dostępnych terminów dla każdego dnia tygodnia.
            </p>
            <p
              className="text-slate-600 text-xs font-sans mb-4 leading-relaxed rounded-xl px-3 py-2"
              style={{
                background: "rgba(255,255,255,0.4)",
                border: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              Zmiany obowiązują od <strong>{scheduleEditEffectiveLabel}</strong>. Bieżący i
              wcześniejsze miesiące pozostają bez zmian.
            </p>

            <div className="flex flex-col gap-4">
              {WORK_WEEKDAYS.map(({ day, label }) => {
                const slots = getSlotsForDay(day)
                return (
                  <div key={day}>
                    <p className="text-slate-800 text-xs font-bold font-sans uppercase tracking-wider mb-2">
                      {label}
                    </p>

                    {/* Existing slots */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {slots.length === 0 && (
                        <span className="text-slate-800 text-xs font-sans italic">brak terminów</span>
                      )}
                      {slots.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold font-sans"
                          style={{
                            background: "rgba(12,17,91,0.08)",
                            border: "1px solid rgba(12,17,91,0.15)",
                            color: "#0C115B",
                          }}
                        >
                          {t}
                          <button
                            onClick={() => removeSlot(day, t)}
                            className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                            aria-label={`Usuń ${t}`}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Add slot */}
                    <div className="flex gap-2">
                      <input
                        type="time"
                        value={newTime[day] ?? ""}
                        onChange={(e) =>
                          setNewTime((p) => ({ ...p, [day]: e.target.value }))
                        }
                        onKeyDown={(e) => e.key === "Enter" && addSlot(day)}
                        className="rounded-xl px-3 py-1.5 text-sm font-sans transition-colors"
                        style={{ ...inputStyle, width: 130 }}
                      />
                      <button
                        onClick={() => addSlot(day)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold font-sans text-white transition-all hover:-translate-y-0.5"
                        style={{ backgroundColor: "#0C115B", border: "1px solid rgba(12,17,91,0.6)" }}
                      >
                        <Plus className="w-3 h-3" />
                        Dodaj
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── In-cabinet weekdays ──────────────────────── */}
            <div className="mt-6 pt-6 border-t border-white/40">
              <h3 className="text-slate-800 font-bold font-sans text-sm mb-2">
                Dni wizyt w gabinecie
              </h3>
              <p className="text-slate-600 text-xs font-sans mb-2 leading-relaxed">
                Wybierz dni tygodnia, w których wizyty odbywają się w gabinecie. Pozostałe dni są
                online (ustawiane automatycznie przy rezerwacji).
              </p>
              <p
                className="text-slate-600 text-xs font-sans mb-4 leading-relaxed rounded-xl px-3 py-2"
                style={{
                  background: "rgba(255,255,255,0.4)",
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                Zmiany obowiązują od <strong>{cabinetEditEffectiveLabel}</strong>. Bieżący i
                wcześniejsze miesiące pozostają bez zmian.
              </p>
              <div className="flex flex-wrap gap-2">
                {WORK_WEEKDAYS.map(({ day, label }) => {
                  const selected = getInCabinetWeekdaysForEdit().includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleInCabinetWeekday(day)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold font-sans transition-colors"
                      style={{
                        background: selected ? "rgba(12,17,91,0.12)" : "rgba(255,255,255,0.5)",
                        border: selected
                          ? "1px solid rgba(12,17,91,0.35)"
                          : "1px solid rgba(0,0,0,0.08)",
                        color: selected ? "#0C115B" : "#475569",
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          {/* ── Blocked slots (specific hours on a date) ─── */}
          <section className="rounded-2xl p-5 xl:col-span-2" style={glassCard}>
            <div className="flex items-center gap-2 mb-4">
              <Ban className="w-4 h-4 text-amber-500" />
              <h2 className="text-slate-800 font-bold font-sans">Blokady godzin</h2>
            </div>
            <p className="text-slate-800 text-xs font-sans mb-4 leading-relaxed">
              Zablokuj wybrane godziny w konkretnym dniu. Pozostałe terminy w tym dniu pozostają dostępne.
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <input
                type="date"
                value={slotBlockDate}
                onChange={(e) => setSlotBlockDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="rounded-xl px-3 py-2 text-sm font-sans transition-colors"
                style={{ ...inputStyle, width: 160 }}
              />
              {!slotBlockDate && (
                <span className="text-slate-800 text-xs font-sans italic">
                  Wybierz datę, aby zobaczyć dostępne godziny
                </span>
              )}
            </div>

            {slotBlockDate && slotsForBlockDate.length === 0 && (
              <p className="text-slate-800 text-xs font-sans italic py-2">
                Brak skonfigurowanych godzin dla tego dnia tygodnia.
              </p>
            )}

            {slotBlockDate && slotsForBlockDate.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {slotsForBlockDate.map((time) => {
                  const isBlocked = blockedSlotMap.get(slotBlockDate)?.has(time) ?? false
                  return (
                    <button
                      key={time}
                      onClick={() => toggleBlockedSlot(slotBlockDate, time)}
                      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold font-sans transition-all hover:-translate-y-0.5"
                      style={
                        isBlocked
                          ? {
                              background: "rgba(254,226,226,0.7)",
                              border: "1.5px solid rgba(239,68,68,0.35)",
                              color: "#b91c1c",
                            }
                          : {
                              background: "rgba(220,252,231,0.7)",
                              border: "1.5px solid rgba(34,197,94,0.3)",
                              color: "#15803d",
                            }
                      }
                      title={isBlocked ? "Kliknij, aby odblokować" : "Kliknij, aby zablokować"}
                    >
                      {isBlocked ? (
                        <X className="w-3 h-3" />
                      ) : (
                        <span className="w-3 h-3 flex items-center justify-center text-[10px]">✓</span>
                      )}
                      {time}
                      <span className="font-normal opacity-75">
                        {isBlocked ? "niedostępny" : "dostępny"}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Summary of all blocked slots */}
            {blockedSlotRecords.length > 0 && (
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                <p className="text-slate-800 text-xs font-semibold font-sans uppercase tracking-wide mb-2">
                  Wszystkie zablokowane godziny
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {blockedSlotRecords
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
                    .map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-sans"
                        style={{
                          background: "rgba(254,226,226,0.55)",
                          border: "1px solid rgba(239,68,68,0.2)",
                          color: "#b91c1c",
                        }}
                      >
                        {r.date} · {r.time}
                        <button
                          onClick={() => db.transact((db.tx.blockedSlots as any)[r.id].delete())}
                          className="opacity-60 hover:opacity-100 transition-opacity"
                          aria-label={`Odblokuj ${r.date} ${r.time}`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Blocked dates ──────────────────────────────── */}
          <section className="rounded-2xl p-5 xl:col-span-2" style={glassCard}>
            <div className="flex items-center gap-2 mb-4">
              <Ban className="w-4 h-4 text-rose-800" />
              <h2 className="text-slate-800 font-bold font-sans">Blokady dni</h2>
            </div>
            <p className="text-slate-800 text-xs font-sans mb-4 leading-relaxed">
              Zablokuj jeden dzień lub zakres dat (urlop, święta, niedyspozycja). Goście nie będą mogli rezerwować wizyt w tych dniach. Istniejące wizyty nie są usuwane.
            </p>

            {/* Add form */}
            <div className="flex flex-wrap items-end gap-2 mb-2">
              <label className="flex flex-col gap-1">
                <span className="text-slate-800 text-[10px] font-semibold font-sans uppercase tracking-wide">
                  Od
                </span>
                <input
                  type="date"
                  value={newBlockedDateFrom}
                  onChange={(e) => {
                    setNewBlockedDateFrom(e.target.value)
                    setBlockedDateError("")
                  }}
                  min={todayStr}
                  className="rounded-xl px-3 py-2 text-sm font-sans transition-colors"
                  style={{ ...inputStyle, width: 160 }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-800 text-[10px] font-semibold font-sans uppercase tracking-wide">
                  Do (opcjonalnie)
                </span>
                <input
                  type="date"
                  value={newBlockedDateTo}
                  onChange={(e) => {
                    setNewBlockedDateTo(e.target.value)
                    setBlockedDateError("")
                  }}
                  min={newBlockedDateFrom || todayStr}
                  className="rounded-xl px-3 py-2 text-sm font-sans transition-colors"
                  style={{ ...inputStyle, width: 160 }}
                />
              </label>
              <input
                type="text"
                value={newBlockedReason}
                onChange={(e) => setNewBlockedReason(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addBlockedDate()}
                placeholder="Powód (opcjonalnie)"
                className="flex-1 min-w-[160px] rounded-xl px-3 py-2 text-sm font-sans placeholder:text-slate-600 transition-colors"
                style={inputStyle}
              />
              <button
                onClick={addBlockedDate}
                disabled={!newBlockedDateFrom}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold font-sans text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#0C115B", border: "1px solid rgba(12,17,91,0.6)" }}
              >
                <Ban className="w-3.5 h-3.5" />
                Zablokuj
              </button>
            </div>
            <p className="text-slate-800 text-xs font-sans mb-2">
              Puste pole „Do” — blokada jednego dnia. Wypełnione oba pola — blokada całego zakresu (włącznie).
            </p>
            {blockedDateError && (
              <p className="text-red-500 text-xs font-sans mb-2">{blockedDateError}</p>
            )}

            {/* Blocked date list */}
            {blockedDates.length === 0 ? (
              <p className="text-slate-800 text-xs font-sans italic py-3 text-center">
                Brak zablokowanych dni
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {blockedDates
                  .slice()
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between rounded-xl px-3 py-2.5"
                      style={{
                        background: "rgba(254,226,226,0.45)",
                        border: "1px solid rgba(239,68,68,0.18)",
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Ban className="w-3 h-3 text-rose-800 flex-shrink-0" />
                        <span className="text-slate-700 text-sm font-semibold font-sans">
                          {formatDate(b.date)}
                        </span>
                        {b.reason && (
                          <span className="text-slate-800 text-xs font-sans truncate">
                            — {b.reason}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removeBlockedDate(b.id)}
                        className="ml-2 flex-shrink-0 p-1 rounded-lg text-rose-800 hover:text-rose-600 hover:bg-rose-100 transition-colors"
                        aria-label={`Odblokuj ${b.date}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <footer className="relative z-10 px-6 pb-6 flex justify-end">
        <button
          onClick={() =>
            db.auth.signOut().catch((err: any) => {
              alert(err?.body?.message ?? err?.message ?? "Nie udało się wylogować.")
            })
          }
          className="px-4 py-2 rounded-xl text-sm font-semibold font-sans text-white transition-all hover:-translate-y-0.5"
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
