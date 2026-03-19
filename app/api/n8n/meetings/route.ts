import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const webhookUrl = process.env.N8N_MEETINGS_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json({ error: "missing_webhook_url" }, { status: 500 })
    }

    const authHeaderName = process.env.N8N_MEETINGS_AUTH_HEADER_NAME
    const authHeaderValue = process.env.N8N_MEETINGS_AUTH_HEADER_VALUE

    const body = (await req.json()) as Record<string, unknown>

    const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    const adminEmailsStr = adminEmails.join(",")
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
  } catch (err: any) {
    return NextResponse.json(
      { error: "proxy_error", message: err?.message ?? "Unknown error" },
      { status: 500 }
    )
  }
}

