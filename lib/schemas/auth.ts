import { z } from "zod"

export const emailSchema = z.string().trim().toLowerCase().email().max(254)

export const sendCodeBodySchema = z.object({
  email: emailSchema,
})

export const verifyCodeBodySchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
})

export const deleteAccountBodySchema = z.object({
  userId: z.string().trim().min(1),
  userEmail: emailSchema,
})

export const dateRangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const meetingActionBodySchema = z.object({
  meetingId: z.string().trim().min(1),
  token: z.string().trim().min(1),
})
