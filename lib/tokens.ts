import crypto from "crypto"

type MeetingAction = "confirm" | "decline"

type TokenPayload = {
  meetingId: string
  action: MeetingAction
  exp: number // unix seconds
}

function base64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

function base64urlDecodeToString(input: string): string {
  const padLen = (4 - (input.length % 4)) % 4
  const padded = input + "=".repeat(padLen)
  const b64 = padded.replaceAll("-", "+").replaceAll("_", "/")
  return Buffer.from(b64, "base64").toString("utf8")
}

function sign(data: string, secret: string): string {
  return base64urlEncode(crypto.createHmac("sha256", secret).update(data).digest())
}

export function createMeetingActionToken(opts: {
  meetingId: string
  action: MeetingAction
  ttlSeconds?: number
  secret?: string
}): string {
  const secret = opts.secret ?? process.env.MEETING_ACTION_TOKEN_SECRET
  if (!secret) throw new Error("Missing MEETING_ACTION_TOKEN_SECRET")

  const nowSec = Math.floor(Date.now() / 1000)
  const exp = nowSec + (opts.ttlSeconds ?? 7 * 24 * 60 * 60)
  const payload: TokenPayload = { meetingId: opts.meetingId, action: opts.action, exp }
  const body = base64urlEncode(JSON.stringify(payload))
  const sig = sign(body, secret)
  return `${body}.${sig}`
}

export function verifyMeetingActionToken(opts: {
  token: string
  meetingId: string
  action: MeetingAction
  secret?: string
}): { ok: true; payload: TokenPayload } | { ok: false; reason: string } {
  const secret = opts.secret ?? process.env.MEETING_ACTION_TOKEN_SECRET
  if (!secret) return { ok: false, reason: "Missing MEETING_ACTION_TOKEN_SECRET" }

  const parts = opts.token.split(".")
  if (parts.length !== 2) return { ok: false, reason: "Malformed token" }
  const [body, sig] = parts

  const expected = sign(body, secret)
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length) return { ok: false, reason: "Invalid signature" }
  const sigOk = crypto.timingSafeEqual(sigBuf, expectedBuf)
  if (!sigOk) return { ok: false, reason: "Invalid signature" }

  let payload: TokenPayload
  try {
    payload = JSON.parse(base64urlDecodeToString(body)) as TokenPayload
  } catch {
    return { ok: false, reason: "Invalid payload" }
  }

  if (payload.meetingId !== opts.meetingId) return { ok: false, reason: "meetingId mismatch" }
  if (payload.action !== opts.action) return { ok: false, reason: "action mismatch" }
  const nowSec = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== "number" || nowSec > payload.exp) return { ok: false, reason: "Token expired" }

  return { ok: true, payload }
}

