import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { getAdminEmails } from "@/lib/admin-emails"
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

export async function POST(req: Request) {
  const rate = enforceRateLimit(req, "n8n:meetings", RATE_LIMITS.meetingsWrite)
  if (!rate.allowed) return rateLimitResponse(rate)

  try {
    const user = await requireRequestUser(req)
    const session = await getSessionInfo(user)
    if (!session.isAdmin && !session.isGuestAllowed) {
      return forbiddenResponse()
    }

    const webhookUrl = process.env.N8N_MEETINGS_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json({ error: "missing_webhook_url" }, { status: 500 })
    }

    const body = await parseJsonBody(req, n8nMeetingBodySchema)

    const authHeaderName = process.env.N8N_MEETINGS_AUTH_HEADER_NAME
    const authHeaderValue = process.env.N8N_MEETINGS_AUTH_HEADER_VALUE

    const adminEmailsStr = getAdminEmails().join(",")
    const payload = { ...body, adminEmails: adminEmailsStr }

    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (authHeaderName && authHeaderValue) {
      headers[authHeaderName] = authHeaderValue
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })

    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "text/plain" },
    })
  } catch (err) {
    if (err instanceof AuthError) return unauthorizedResponse()
    if (err instanceof ZodError) return validationErrorResponse(err)
    return serverErrorResponse("n8n/meetings", err)
  }
}
