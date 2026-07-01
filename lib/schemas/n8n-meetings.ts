import { z } from "zod"

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/)
const categorySchema = z.enum(["w_gabinecie", "online"])
const isoTimestampSchema = z.string().datetime({ offset: true }).or(z.string().min(1))

const meetingCoreFields = {
  meetingId: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  category: categorySchema,
  date: dateSchema,
  time: timeSchema.optional(),
  duration: z.number().int().min(1).max(120).optional(),
  userEmail: z.string().trim().email().max(254).optional().nullable(),
  userPhone: z.string().trim().max(32).optional().nullable(),
  phone: z.string().trim().max(32).optional(),
}

export const n8nMeetingCreatedSchema = z
  .object({
    event: z.literal("meeting.created"),
    ...meetingCoreFields,
    userId: z.string().trim().min(1).max(64).optional(),
    createdAt: isoTimestampSchema,
    lastEditedBy: z.enum(["admin", "guest"]).optional(),
    updatedAt: isoTimestampSchema.optional(),
  })
  .strict()

export const n8nMeetingEditedSchema = z
  .object({
    event: z.literal("meeting.edited"),
    editedBy: z.enum(["user", "admin"]),
    ...meetingCoreFields,
    status: z.enum(["confirmed", "not_confirmed"]).optional().nullable(),
    previousDate: dateSchema.optional().nullable(),
    previousTime: timeSchema.optional().nullable(),
    previousDuration: z.number().int().min(1).max(120).optional().nullable(),
    changeRequestedAt: isoTimestampSchema.optional().nullable(),
    updatedAt: isoTimestampSchema.optional(),
  })
  .strict()

export const n8nMeetingDeletedSchema = z
  .object({
    event: z.literal("meeting.deleted"),
    deletedBy: z.enum(["user", "admin"]),
    ...meetingCoreFields,
    deletedAt: isoTimestampSchema,
  })
  .strict()

export const n8nMeetingBodySchema = z.discriminatedUnion("event", [
  n8nMeetingCreatedSchema,
  n8nMeetingEditedSchema,
  n8nMeetingDeletedSchema,
])

export type N8nMeetingBody = z.infer<typeof n8nMeetingBodySchema>
