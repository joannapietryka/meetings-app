import { NextResponse } from "next/server"
import { ZodError } from "zod"
import {
  instantAdminQuery,
  instantAdminTransact,
  instantAdminDeleteUser,
} from "@/lib/instant-admin"
import { requireRequestUser, AuthError } from "@/lib/instant-auth"
import {
  forbiddenResponse,
  parseJsonBody,
  rateLimitResponse,
  serverErrorResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "@/lib/api-response"
import { deleteAccountBodySchema } from "@/lib/schemas/auth"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { auditLog } from "@/lib/audit-log"

type Meeting = { id: string; userId?: string }
type AllowedUser = { id: string; email: string }

export async function POST(req: Request) {
  const rate = enforceRateLimit(req, "account:delete", RATE_LIMITS.accountDelete)
  if (!rate.allowed) return rateLimitResponse(rate)

  try {
    const user = await requireRequestUser(req)
    const { userId, userEmail } = await parseJsonBody(req, deleteAccountBodySchema)

    if (user.id !== userId) {
      return forbiddenResponse()
    }

    const normalizedEmail = userEmail.trim().toLowerCase()
    if ((user.email ?? "").trim().toLowerCase() !== normalizedEmail) {
      return forbiddenResponse()
    }

    const meetingsResult = await instantAdminQuery<{ meetings: Meeting[] }>({
      query: { meetings: {} },
    })

    const userMeetings = (meetingsResult.meetings ?? []).filter((m) => m.userId === userId)

    const meetingSteps = userMeetings.map((m) => [
      "update",
      "meetings",
      m.id,
      { userId: null, userEmail: "[konto usunięte]" },
    ])

    const allowedResult = await instantAdminQuery<{ allowedUsers: AllowedUser[] }>({
      query: { allowedUsers: {} },
    })

    const allowedEntry = (allowedResult.allowedUsers ?? []).find(
      (u) => u.email.toLowerCase() === normalizedEmail,
    )

    const allowedSteps = allowedEntry
      ? [["delete", "allowedUsers", allowedEntry.id]]
      : []

    if (meetingSteps.length > 0 || allowedSteps.length > 0) {
      await instantAdminTransact({ steps: [...meetingSteps, ...allowedSteps] })
    }

    await instantAdminDeleteUser(userId)

    auditLog("account.deleted", {
      userId,
      userEmail: normalizedEmail,
      meetingsAnonymized: userMeetings.length,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return unauthorizedResponse()
    if (err instanceof ZodError) return validationErrorResponse(err)
    return serverErrorResponse("account/delete", err)
  }
}
