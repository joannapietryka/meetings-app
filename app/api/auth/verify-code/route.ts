import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { instantAdminQuery, instantAdminTransact } from "@/lib/instant-admin"
import { isGuestEmailAllowed } from "@/lib/access-control"
import { getInstantAdminDb } from "@/lib/instant-auth"
import {
  parseJsonBody,
  rateLimitResponse,
  serverErrorResponse,
  validationErrorResponse,
} from "@/lib/api-response"
import { verifyCodeBodySchema } from "@/lib/schemas/auth"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { verifyOtpCode, isOtpExpired, OTP_MAX_ATTEMPTS } from "@/lib/otp"
import {
  getActiveOtpLock,
  otpLockoutUntil,
  otpLockRetryAfterSec,
  type OtpSessionRecord,
} from "@/lib/otp-lockout"

export async function POST(req: Request) {
  const rate = enforceRateLimit(req, "auth:verify-code", RATE_LIMITS.verifyCode)
  if (!rate.allowed) return rateLimitResponse(rate)

  try {
    const { email, code } = await parseJsonBody(req, verifyCodeBodySchema)

    const result = await instantAdminQuery<{ otpSessions: OtpSessionRecord[] }>({
      query: { otpSessions: { $: { where: { email } } } },
    })

    const sessions = (result.otpSessions ?? []).sort(
      (a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime(),
    )
    const session = sessions[0]

    if (!session) {
      return NextResponse.json({ error: "invalid_code" }, { status: 401 })
    }

    const activeLock = getActiveOtpLock(sessions)
    if (activeLock?.lockedUntil) {
      return NextResponse.json(
        {
          error: "too_many_attempts",
          retryAfterSec: otpLockRetryAfterSec(activeLock.lockedUntil),
        },
        { status: 429 },
      )
    }

    if (isOtpExpired(session.expiresAt)) {
      await instantAdminTransact({ steps: [["delete", "otpSessions", session.id]] })
      return NextResponse.json({ error: "code_expired" }, { status: 410 })
    }

    if (session.attempts >= OTP_MAX_ATTEMPTS) {
      const lockedUntil = otpLockoutUntil()
      await instantAdminTransact({
        steps: [
          [
            "update",
            "otpSessions",
            session.id,
            { attempts: OTP_MAX_ATTEMPTS, lockedUntil, hashedCode: "" },
          ],
        ],
      })
      return NextResponse.json(
        {
          error: "too_many_attempts",
          retryAfterSec: otpLockRetryAfterSec(lockedUntil),
        },
        { status: 429 },
      )
    }

    const nextAttempts = session.attempts + 1

    if (!verifyOtpCode(code, session.hashedCode)) {
      if (nextAttempts >= OTP_MAX_ATTEMPTS) {
        const lockedUntil = otpLockoutUntil()
        await instantAdminTransact({
          steps: [
            [
              "update",
              "otpSessions",
              session.id,
              { attempts: nextAttempts, lockedUntil, hashedCode: "" },
            ],
          ],
        })
        return NextResponse.json(
          {
            error: "too_many_attempts",
            retryAfterSec: otpLockRetryAfterSec(lockedUntil),
          },
          { status: 429 },
        )
      }

      await instantAdminTransact({
        steps: [["update", "otpSessions", session.id, { attempts: nextAttempts }]],
      })

      const remaining = OTP_MAX_ATTEMPTS - nextAttempts
      return NextResponse.json(
        { error: "invalid_code", attemptsRemaining: Math.max(0, remaining) },
        { status: 401 },
      )
    }

    const stillAllowed = await isGuestEmailAllowed(email)
    if (!stillAllowed) {
      await instantAdminTransact({ steps: [["delete", "otpSessions", session.id]] })
      return NextResponse.json({ error: "invalid_code" }, { status: 401 })
    }

    await instantAdminTransact({ steps: [["delete", "otpSessions", session.id]] })

    const adminDb = getInstantAdminDb()
    const token = await adminDb.auth.createToken({ email })

    return NextResponse.json({ ok: true, token })
  } catch (err) {
    if (err instanceof ZodError) return validationErrorResponse(err)
    return serverErrorResponse("auth/verify-code", err)
  }
}
