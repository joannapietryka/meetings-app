export type TaskCategory = "bed1" | "bed2" | "contract" | "other"

export interface Task {
  id: string
  title: string
  description?: string
  category: TaskCategory
  date: string // ISO date string "YYYY-MM-DD"
  time?: string // e.g. "09:00"
  duration?: number // in minutes, defaults to 30
}

// Calendar constants
export const CALENDAR_START_HOUR = 9  // 9am
export const CALENDAR_END_HOUR = 17   // 5pm
export const SLOT_MINUTES = 30
export const TOTAL_SLOTS = ((CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60) / SLOT_MINUTES // 16 slots
export const SLOT_HEIGHT_PX = 40 // px per 30-min slot

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  bed1: "1-bed viewing",
  bed2: "2-beds viewing",
  contract: "Contract signing",
  other: "Other",
}

export const CATEGORY_COLORS: Record<TaskCategory, { bg: string; border: string; dot: string }> = {
  bed1: {
    bg: "rgba(199, 210, 254, 0.55)",
    border: "rgba(99, 102, 241, 0.3)",
    dot: "#4338ca",
  },
  bed2: {
    bg: "rgba(254, 215, 170, 0.55)",
    border: "rgba(217, 119, 6, 0.3)",
    dot: "#d97706",
  },
  contract: {
    bg: "rgba(167, 243, 208, 0.55)",
    border: "rgba(5, 150, 105, 0.3)",
    dot: "#059669",
  },
  other: {
    bg: "rgba(255, 255, 255, 0.45)",
    border: "rgba(0, 0, 0, 0.1)",
    dot: "#9ca3af",
  },
}

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
