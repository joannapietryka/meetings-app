import { NextResponse } from "next/server"
import { ZodError } from "zod"
import {
  AuthError,
  getSessionInfo,
  requireRequestUser,
} from "@/lib/instant-auth"
import { updateGuestMeeting } from "@/lib/guest-booking-server"
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

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, context: RouteContext) {
  const rate = enforceRateLimit(req, "meetings:update", RATE_LIMITS.meetingsWrite)
  if (!rate.allowed) return rateLimitResponse(rate)

  try {
    const { id: meetingId } = await context.params
    const user = await requireRequestUser(req)
    const session = await getSessionInfo(user)
    if (session.isAdmin || !session.isGuestAllowed) {
      return forbiddenResponse()
    }

    const body = await parseJsonBody(req, guestMeetingBodySchema)
    const result = await updateGuestMeeting(user, meetingId, body)
    if (!result.ok) {
      return bookingErrorResponse(result.code, result.message, result.status)
    }

    auditLog("meeting.updated", {
      meetingId,
      userId: user.id,
      date: body.date,
      time: body.time,
    })

    return NextResponse.json({ ok: true, updatedAt: result.updatedAt })
  } catch (err) {
    if (err instanceof AuthError) return unauthorizedResponse()
    if (err instanceof ZodError) return validationErrorResponse(err)
    return serverErrorResponse("meetings/update", err)
  }
}
