import { NextResponse } from "next/server"
import { init } from "@instantdb/admin"
import { instantAdminQuery, instantAdminTransact } from "@/lib/instant-admin"
import { verifyOtpCode, isOtpExpired, OTP_MAX_ATTEMPTS } from "@/lib/otp"

type OtpSession = {
  id: string
  email: string
  hashedCode: string
  expiresAt: string
  attempts: number
}

function getAdminDb() {
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID
  const adminToken = process.env.INSTANT_ADMIN_TOKEN
  if (!appId || !adminToken) throw new Error("Missing InstantDB env vars")
  return init({ appId, adminToken })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; code?: string }
    const email = (body.email ?? "").trim().toLowerCase()
    const code = (body.code ?? "").trim()

    if (!email || !code) {
      return NextResponse.json({ error: "email_and_code_required" }, { status: 400 })
    }

    // Look up the OTP session for this email
    const result = await instantAdminQuery<{ otpSessions: OtpSession[] }>({
      query: { otpSessions: { $: { where: { email } } } },
    })

    const sessions = (result.otpSessions ?? []).sort(
      (a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime()
    )
    const session = sessions[0]

    if (!session) {
      return NextResponse.json({ error: "no_session" }, { status: 404 })
    }

    // TTL check
    if (isOtpExpired(session.expiresAt)) {
      await instantAdminTransact({ steps: [["delete", "otpSessions", session.id]] })
      return NextResponse.json({ error: "code_expired" }, { status: 410 })
    }

    // Attempt limit check
    if (session.attempts >= OTP_MAX_ATTEMPTS) {
      await instantAdminTransact({ steps: [["delete", "otpSessions", session.id]] })
      return NextResponse.json({ error: "too_many_attempts" }, { status: 429 })
    }

    // Increment attempts before verifying (prevents timing-based enumeration)
    await instantAdminTransact({
      steps: [["update", "otpSessions", session.id, { attempts: session.attempts + 1 }]],
    })

    // Constant-time hash comparison
    if (!verifyOtpCode(code, session.hashedCode)) {
      const remaining = OTP_MAX_ATTEMPTS - (session.attempts + 1)
      return NextResponse.json(
        { error: "invalid_code", attemptsRemaining: Math.max(0, remaining) },
        { status: 401 }
      )
    }

    // Code is valid — delete session and issue an InstantDB login token
    await instantAdminTransact({ steps: [["delete", "otpSessions", session.id]] })

    const adminDb = getAdminDb()
    const token = await adminDb.auth.createToken(email)

    return NextResponse.json({ ok: true, token })
  } catch (err: any) {
    console.error("[auth/verify-code]", err)
    return NextResponse.json(
      { error: "server_error", message: err?.message ?? "Unknown error" },
      { status: 500 }
    )
  }
}
