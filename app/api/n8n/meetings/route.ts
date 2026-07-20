import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { requireRequestUser, AuthError, getSessionInfo } from "@/lib/instant-auth"
import {
  parseJsonBody,
  rateLimitResponse,
  serverErrorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  forbiddenResponse,
} from "@/lib/api-response"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { n8nMeetingBodySchema } from "@/lib/schemas/n8n-meetings"
import { forwardMeetingWebhook } from "@/lib/n8n-meetings-webhook"

export async function POST(req: Request) {
  const rate = enforceRateLimit(req, "n8n:meetings", RATE_LIMITS.meetingsWrite)
  if (!rate.allowed) return rateLimitResponse(rate)

  try {
    const user = await requireRequestUser(req)
    const session = await getSessionInfo(user)
    if (!session.isAdmin && !session.isGuestAllowed) {
      return forbiddenResponse()
    }

    if (!process.env.N8N_MEETINGS_WEBHOOK_URL) {
      return NextResponse.json({ error: "missing_webhook_url" }, { status: 500 })
    }

    const body = await parseJsonBody(req, n8nMeetingBodySchema)
    const result = await forwardMeetingWebhook(body)

    if (!result.ok) {
      if (result.error === "missing_webhook_url") {
        return NextResponse.json({ error: "missing_webhook_url" }, { status: 500 })
      }
      return NextResponse.json(
        { error: result.error },
        { status: result.status && result.status >= 400 ? result.status : 502 },
      )
    }

    return NextResponse.json({ ok: true }, { status: result.status || 200 })
  } catch (err) {
    if (err instanceof AuthError) return unauthorizedResponse()
    if (err instanceof ZodError) return validationErrorResponse(err)
    return serverErrorResponse("n8n/meetings", err)
  }
}
