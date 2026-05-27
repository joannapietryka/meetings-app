export type TaskCategory = "w_gabinecie" | "online"

export interface Task {
  id: string
  title: string
  description?: string
  category: TaskCategory
  date: string // ISO date string "YYYY-MM-DD"
  time?: string // e.g. "09:00"
  duration?: number // in minutes, defaults to SESSION_DURATION
}

// Calendar constants
export const CALENDAR_START_HOUR = 8   // 8am (Friday starts at 8:00)
export const CALENDAR_END_HOUR = 21    // 9pm (Wed last session ends at 20:05)
export const SLOT_MINUTES = 15         // 15-min grid aligns with all slot times (10:15, 14:45 etc.)
export const TOTAL_SLOTS = ((CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60) / SLOT_MINUTES // 52
export const SLOT_HEIGHT_PX = 20       // px per 15-min slot

export const SESSION_DURATION = 50     // all sessions are 50 minutes

export const SLOT_ROW_HEIGHT = 64      // px per session slot row (legacy, kept for compatibility)

// Time-based grid constants — 1.5 px per minute, 50-min session = 75 px
export const PX_PER_MINUTE = 1.5
export const GRID_TOTAL_HEIGHT = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60 * PX_PER_MINUTE

// Available slot start times per weekday — key = getDay(): 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
export const DAY_SLOTS: Record<number, string[]> = {
  1: ["09:00", "10:15", "11:30", "13:30", "14:45", "16:00", "18:00"],
  2: ["09:00", "10:15", "11:30", "13:30", "14:45", "16:00", "18:00", "19:00"],
  3: ["14:00", "15:00", "16:15", "17:15", "18:15", "19:15"],
  4: ["09:00", "10:15", "11:30", "13:30", "14:45", "16:00", "18:00", "19:00"],
  5: ["08:00", "09:00", "10:00", "11:15"],
}

// Sorted union of every slot across all weekdays — drives the shared grid row layout
export const ALL_WEEK_SLOTS: string[] = Array.from(
  new Set(Object.values(DAY_SLOTS).flat())
).sort()

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  w_gabinecie: "W gabinecie",
  online:      "Online",
}

export const CATEGORY_COLORS: Record<TaskCategory, { bg: string; border: string; dot: string }> = {
  w_gabinecie: {
    bg: "rgba(199, 210, 254, 0.55)",
    border: "rgba(99, 102, 241, 0.3)",
    dot: "#4338ca",
  },
  online: {
    bg: "rgba(167, 243, 208, 0.55)",
    border: "rgba(5, 150, 105, 0.3)",
    dot: "#059669",
  },
}

/** Fallback colors for meetings stored with legacy category values. */
export const FALLBACK_CATEGORY_COLORS = {
  bg: "rgba(255, 255, 255, 0.45)",
  border: "rgba(0, 0, 0, 0.1)",
  dot: "#9ca3af",
}

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
