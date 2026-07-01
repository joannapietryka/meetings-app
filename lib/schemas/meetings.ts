import { z } from "zod"
import { SESSION_DURATION } from "@/lib/calendar-types"

export const guestMeetingBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(["w_gabinecie", "online"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.number().int().min(1).max(120).optional().default(SESSION_DURATION),
  phone: z.string().trim().min(1).max(32),
})

export type GuestMeetingBody = z.infer<typeof guestMeetingBodySchema>
