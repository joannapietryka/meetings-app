import { NextResponse } from "next/server"
import { id } from "@instantdb/react"
import { instantAdminQuery, instantAdminTransact } from "@/lib/instant-admin"
import {
  generateOtpCode,
  hashOtpCode,
  otpExpiresAt,
  OTP_TTL_MS,
} from "@/lib/otp"

type AllowedUser = { email: string }
type OtpSession = { id: string; email: string; expiresAt: string }

async function isEmailAllowed(email: string): Promise<boolean> {
  const lower = email.toLowerCase()

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (adminEmails.includes(lower)) return true

  const result = await instantAdminQuery<{ allowedUsers: AllowedUser[] }>({
    query: { allowedUsers: {} },
  })
  return (result.allowedUsers ?? []).some((u) => u.email.toLowerCase() === lower)
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL ?? "noreplay@katarzynapietryka.com>"

  if (!apiKey) {
    // Fall back to logging in development when Resend is not configured
    console.warn(`[OTP] Code for ${email}: ${code}  (set RESEND_API_KEY to send real emails)`)
    return
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Twój kod logowania",
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto">
          <h2 style="color:#0C115B">Kod logowania</h2>
          <p>Twój jednorazowy kod dostępu (ważny 5 minut):</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:0.3em;color:#0C115B;padding:16px 0">
            ${code}
          </div>
          <p style="color:#666;font-size:13px">
            Jeśli to nie Ty, zignoruj tę wiadomość.
          </p>
        </div>
      `,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Resend error ${res.status}: ${body}`)
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string }
    const email = (body.email ?? "").trim().toLowerCase()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 })
    }

    const allowed = await isEmailAllowed(email)
    if (!allowed) {
      return NextResponse.json({ error: "not_allowed" }, { status: 403 })
    }

    // Rate-limit: reject if an unexpired session already exists (sent < TTL ago)
    const existing = await instantAdminQuery<{ otpSessions: OtpSession[] }>({
      query: { otpSessions: { $: { where: { email } } } },
    })
    const activeSession = (existing.otpSessions ?? []).find(
      (s) => new Date(s.expiresAt).getTime() > Date.now()
    )
    if (activeSession) {
      const retryAfterSec = Math.ceil(
        (new Date(activeSession.expiresAt).getTime() - Date.now()) / 1000
      )
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec },
        { status: 429 }
      )
    }

    // Delete any stale/expired sessions for this email
    const stale = (existing.otpSessions ?? []).filter(
      (s) => new Date(s.expiresAt).getTime() <= Date.now()
    )
    if (stale.length > 0) {
      await instantAdminTransact({
        steps: stale.map((s) => ["delete", "otpSessions", s.id]),
      })
    }

    // Generate code, hash it, store in DB
    const code = generateOtpCode()
    const hashedCode = hashOtpCode(code)
    const expiresAt = otpExpiresAt()
    const sessionId = id()

    await instantAdminTransact({
      steps: [
        ["update", "otpSessions", sessionId, { email, hashedCode, expiresAt, attempts: 0 }],
      ],
    })

    // Send email (after DB write so we never lose track of a sent code)
    await sendOtpEmail(email, code)

    return NextResponse.json({ ok: true, ttlSeconds: Math.floor(OTP_TTL_MS / 1000) })
  } catch (err: any) {
    console.error("[auth/send-code]", err)
    return NextResponse.json(
      { error: "server_error", message: err?.message ?? "Unknown error" },
      { status: 500 }
    )
  }
}
