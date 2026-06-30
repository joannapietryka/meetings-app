import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { id } from "@instantdb/react"
import { instantAdminQuery, instantAdminTransact } from "@/lib/instant-admin"
import { isGuestEmailAllowed } from "@/lib/access-control"
import {
  parseJsonBody,
  rateLimitResponse,
  serverErrorResponse,
  validationErrorResponse,
} from "@/lib/api-response"
import { sendCodeBodySchema } from "@/lib/schemas/auth"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import {
  generateOtpCode,
  hashOtpCode,
  otpExpiresAt,
  OTP_TTL_MS,
} from "@/lib/otp"
import {
  getActiveOtpLock,
  getActiveOtpSession,
  otpLockRetryAfterSec,
  type OtpSessionRecord,
} from "@/lib/otp-lockout"

function isProduction(): boolean {
  return process.env.NODE_ENV === "production"
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL ?? "noreply@katarzynapietryka.com"

  if (!apiKey) {
    if (isProduction()) {
      throw new Error("RESEND_API_KEY is not configured")
    }
    throw new Error("RESEND_API_KEY is required to send login codes")
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

function genericSendResponse() {
  return NextResponse.json({
    ok: true,
    ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
    message:
      "Jeśli Twój adres jest uprawniony, wysłaliśmy kod logowania. Sprawdź skrzynkę (także folder spam).",
  })
}

function sessionsEligibleForCleanup(sessions: OtpSessionRecord[], now = Date.now()) {
  return sessions.filter((session) => {
    if (session.lockedUntil && now < new Date(session.lockedUntil).getTime()) {
      return false
    }
    if (session.hashedCode && now < new Date(session.expiresAt).getTime()) {
      return false
    }
    return true
  })
}

export async function POST(req: Request) {
  const rate = enforceRateLimit(req, "auth:send-code", RATE_LIMITS.sendCode)
  if (!rate.allowed) return rateLimitResponse(rate)

  try {
    const { email } = await parseJsonBody(req, sendCodeBodySchema)

    const allowed = await isGuestEmailAllowed(email)
    if (!allowed) {
      await new Promise((r) => setTimeout(r, 300 + Math.floor(Math.random() * 300)))
      return genericSendResponse()
    }

    const existing = await instantAdminQuery<{ otpSessions: OtpSessionRecord[] }>({
      query: { otpSessions: { $: { where: { email } } } },
    })
    const sessions = existing.otpSessions ?? []

    const lock = getActiveOtpLock(sessions)
    if (lock?.lockedUntil) {
      return NextResponse.json(
        {
          error: "locked_out",
          retryAfterSec: otpLockRetryAfterSec(lock.lockedUntil),
        },
        { status: 429 },
      )
    }

    const activeSession = getActiveOtpSession(sessions)
    if (activeSession) {
      const retryAfterSec = Math.ceil(
        (new Date(activeSession.expiresAt).getTime() - Date.now()) / 1000,
      )
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec },
        { status: 429 },
      )
    }

    const stale = sessionsEligibleForCleanup(sessions)
    if (stale.length > 0) {
      await instantAdminTransact({
        steps: stale.map((s) => ["delete", "otpSessions", s.id]),
      })
    }

    const code = generateOtpCode()
    const hashedCode = hashOtpCode(code)
    const expiresAt = otpExpiresAt()
    const sessionId = id()

    await instantAdminTransact({
      steps: [
        ["update", "otpSessions", sessionId, { email, hashedCode, expiresAt, attempts: 0 }],
      ],
    })

    await sendOtpEmail(email, code)

    return NextResponse.json({
      ok: true,
      sent: true,
      ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
    })
  } catch (err) {
    if (err instanceof ZodError) return validationErrorResponse(err)
    return serverErrorResponse("auth/send-code", err)
  }
}
