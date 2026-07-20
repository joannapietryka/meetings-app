import { getAdminEmails } from "@/lib/admin-emails"
import type { N8nMeetingBody } from "@/lib/schemas/n8n-meetings"

/** Convert ISO date `YYYY-MM-DD` → display format `DD.MM.YYYY` for n8n. */
export function toWebhookDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-")
  return `${day}.${month}.${year}`
}

export function formatPayloadDatesForWebhook(body: N8nMeetingBody): N8nMeetingBody {
  if (body.event === "meeting.edited") {
    return {
      ...body,
      date: toWebhookDate(body.date),
      previousDate:
        body.previousDate == null ? body.previousDate : toWebhookDate(body.previousDate),
    }
  }

  return {
    ...body,
    date: toWebhookDate(body.date),
  }
}

export type ForwardMeetingWebhookResult =
  | { ok: true; status: number }
  | { ok: false; error: string; status?: number }

/**
 * Forward a validated meeting event to the configured n8n webhook.
 * Returns a result instead of throwing so callers can decide whether to fail the request.
 */
export async function forwardMeetingWebhook(
  body: N8nMeetingBody,
): Promise<ForwardMeetingWebhookResult> {
  const webhookUrl = process.env.N8N_MEETINGS_WEBHOOK_URL
  if (!webhookUrl) {
    return { ok: false, error: "missing_webhook_url" }
  }

  const authHeaderName = process.env.N8N_MEETINGS_AUTH_HEADER_NAME
  const authHeaderValue = process.env.N8N_MEETINGS_AUTH_HEADER_VALUE

  const payload = {
    ...formatPayloadDatesForWebhook(body),
    adminEmails: getAdminEmails().join(","),
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (authHeaderName && authHeaderValue) {
    headers[authHeaderName] = authHeaderValue
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.error("[n8n/meetings webhook]", res.status, text.slice(0, 500))
      return { ok: false, error: "webhook_failed", status: res.status }
    }

    return { ok: true, status: res.status }
  } catch (err) {
    console.error("[n8n/meetings webhook]", err)
    return { ok: false, error: "webhook_error" }
  }
}
