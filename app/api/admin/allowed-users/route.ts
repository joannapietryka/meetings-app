import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { id } from "@instantdb/react"
import { instantAdminQuery, instantAdminTransact } from "@/lib/instant-admin"
import { AuthError, getSessionInfo, requireRequestUser } from "@/lib/instant-auth"
import {
  forbiddenResponse,
  parseJsonBody,
  rateLimitResponse,
  serverErrorResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "@/lib/api-response"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { grantAccessBodySchema } from "@/lib/schemas/auth"
import { forwardMeetingWebhook } from "@/lib/n8n-meetings-webhook"

type AllowedUser = { id: string; email: string }

export async function POST(req: Request) {
  const rate = enforceRateLimit(req, "admin:allowed-users", RATE_LIMITS.meetingsWrite)
  if (!rate.allowed) return rateLimitResponse(rate)

  try {
    const user = await requireRequestUser(req)
    const session = await getSessionInfo(user)
    if (!session.isAdmin) return forbiddenResponse()

    const { email } = await parseJsonBody(req, grantAccessBodySchema)
    const existing = await instantAdminQuery<{ allowedUsers: AllowedUser[] }>({
      query: { allowedUsers: { $: { where: { email } } } },
    })
    if ((existing.allowedUsers ?? []).some((entry) => entry.email.toLowerCase() === email)) {
      return NextResponse.json(
        { error: "already_allowed", message: "Ten adres jest już na liście" },
        { status: 409 },
      )
    }

    const grantedAt = new Date().toISOString()
    await instantAdminTransact({
      steps: [["update", "allowedUsers", id(), { email, createdAt: grantedAt }]],
    })

    const webhook = await forwardMeetingWebhook({
      event: "access.granted",
      userEmail: email,
      grantedAt,
    })
    if (!webhook.ok) {
      console.error("[admin/allowed-users webhook]", webhook.error, webhook.status)
    }

    return NextResponse.json({ ok: true, email, grantedAt, notified: webhook.ok })
  } catch (err) {
    if (err instanceof AuthError) return unauthorizedResponse()
    if (err instanceof ZodError) return validationErrorResponse(err)
    return serverErrorResponse("admin/allowed-users", err)
  }
}
