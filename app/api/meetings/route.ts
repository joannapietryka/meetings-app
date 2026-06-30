import { NextResponse } from "next/server"
import { ZodError } from "zod"
import {
  AuthError,
  getSessionInfo,
  requireRequestUser,
} from "@/lib/instant-auth"
import { createGuestMeeting } from "@/lib/guest-booking-server"
import { guestMeetingBodySchema } from "@/lib/schemas/meetings"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { auditLog } from "@/lib/audit-log"
import {
  bookingErrorResponse,
  forbiddenResponse,
  parseJsonBody,
  rateLimitResponse,
  serverErrorResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "@/lib/api-response"

export async function POST(req: Request) {
  const rate = enforceRateLimit(req, "meetings:create", RATE_LIMITS.meetingsWrite)
  if (!rate.allowed) return rateLimitResponse(rate)

  try {
    const user = await requireRequestUser(req)
    const session = await getSessionInfo(user)
    if (session.isAdmin || !session.isGuestAllowed) {
      return forbiddenResponse()
    }

    const body = await parseJsonBody(req, guestMeetingBodySchema)
    const result = await createGuestMeeting(user, body)
    if (!result.ok) {
      return bookingErrorResponse(result.code, result.message, result.status)
    }

    auditLog("meeting.created", {
      meetingId: result.meetingId,
      userId: user.id,
      date: body.date,
      time: body.time,
    })

    return NextResponse.json({
      ok: true,
      meetingId: result.meetingId,
      createdAt: result.createdAt,
    })
  } catch (err) {
    if (err instanceof AuthError) return unauthorizedResponse()
    if (err instanceof ZodError) return validationErrorResponse(err)
    return serverErrorResponse("meetings/create", err)
  }
}
