"use client"

import { useEffect, useMemo, useState } from "react"
import { CALENDAR_END_HOUR, CALENDAR_START_HOUR } from "@/lib/calendar-types"
import {
  formatTimeParts,
  getValidMinuteMarksForHour,
  parseTimeParts,
  snapTimeToFiveMinutes,
} from "@/lib/time-options"

interface TimePickerInputProps {
  value: string
  onChange: (value: string) => void
  id?: string
  name?: string
  inputStyle?: React.CSSProperties
  className?: string
  /** When set, minute options outside this list are disabled (e.g. booked slots). */
  availableTimes?: Set<string>
}

const inputClassName =
  "rounded-xl px-3 py-2.5 text-sm font-sans transition-colors focus:border-slate-300"

const fieldWidthClass = "w-[4.5rem] shrink-0 tabular-nums"

function parseCommittedValue(value: string) {
  return value ? parseTimeParts(snapTimeToFiveMinutes(value)) : null
}

export function TimePickerInput({
  value,
  onChange,
  id,
  name,
  inputStyle,
  className,
  availableTimes,
}: TimePickerInputProps) {
  const parsed = parseCommittedValue(value)
  const minuteValue = parsed?.minute ?? "00"

  const [hourDraft, setHourDraft] = useState(() => (parsed ? String(parsed.hour) : ""))

  useEffect(() => {
    const next = parseCommittedValue(value)
    setHourDraft(next ? String(next.hour) : "")
  }, [value])

  const minuteOptions = useMemo(() => {
    if (hourDraft === "") return getValidMinuteMarksForHour(CALENDAR_START_HOUR)
    const hour = Number(hourDraft)
    if (Number.isNaN(hour)) return getValidMinuteMarksForHour(CALENDAR_START_HOUR)
    return getValidMinuteMarksForHour(hour)
  }, [hourDraft])

  const commitTime = (hourStr: string, minute: string) => {
    if (hourStr === "") {
      onChange("")
      return
    }

    const h = Number(hourStr)
    if (Number.isNaN(h)) return

    const clampedHour = Math.max(
      CALENDAR_START_HOUR,
      Math.min(CALENDAR_END_HOUR - 1, h),
    )
    const validMinutes = getValidMinuteMarksForHour(clampedHour)
    const m = validMinutes.includes(minute as (typeof validMinutes)[number])
      ? minute
      : validMinutes[0]
    if (!m) return

    setHourDraft(String(clampedHour))
    onChange(formatTimeParts(clampedHour, m))
  }

  const handleHourBlur = () => {
    if (hourDraft === "") {
      onChange("")
      return
    }
    commitTime(hourDraft, minuteValue)
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <input
        id={id}
        name={name ? `${name}-hour` : undefined}
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={hourDraft}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, 2)
          setHourDraft(next)
        }}
        onBlur={handleHourBlur}
        placeholder="hh"
        aria-label="Godzina"
        className={`${inputClassName} ${fieldWidthClass}`}
        style={inputStyle}
      />
      <span className="text-slate-600 font-sans text-sm">:</span>
      <select
        name={name ? `${name}-minute` : undefined}
        value={
          minuteOptions.includes(minuteValue as (typeof minuteOptions)[number])
            ? minuteValue
            : minuteOptions[0] ?? "00"
        }
        onChange={(e) =>
          commitTime(hourDraft || String(CALENDAR_START_HOUR), e.target.value)
        }
        aria-label="Minuty"
        className={`${inputClassName} ${fieldWidthClass} cursor-pointer`}
        style={{ ...inputStyle, WebkitAppearance: "none" }}
      >
        {minuteOptions.map((min) => {
          const slot =
            hourDraft !== "" && !Number.isNaN(Number(hourDraft))
              ? formatTimeParts(Number(hourDraft), min)
              : null
          const unavailable = slot && availableTimes ? !availableTimes.has(slot) : false
          return (
            <option key={min} value={min} disabled={unavailable}>
              {unavailable ? `${min} (niedostępny)` : min}
            </option>
          )
        })}
      </select>
    </div>
  )
}
