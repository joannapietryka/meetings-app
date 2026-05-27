import { createHmac, randomInt } from "crypto"

export const OTP_TTL_MS = 5 * 60 * 1000   // 5 minutes
export const OTP_MAX_ATTEMPTS = 5
const CODE_DIGITS = 6

function secret(): string {
  const s = process.env.OTP_HMAC_SECRET
  if (!s) throw new Error("Missing OTP_HMAC_SECRET env var")
  return s
}

/** Generates a cryptographically secure 6-digit OTP string (zero-padded). */
export function generateOtpCode(): string {
  return randomInt(0, 10 ** CODE_DIGITS).toString().padStart(CODE_DIGITS, "0")
}

/** Returns HMAC-SHA256 hex of the code. Never store the plaintext code. */
export function hashOtpCode(code: string): string {
  return createHmac("sha256", secret()).update(code).digest("hex")
}

/** Constant-time comparison to prevent timing attacks. */
export function verifyOtpCode(submittedCode: string, storedHash: string): boolean {
  const submittedHash = hashOtpCode(submittedCode)
  // timingSafeEqual requires same-length buffers
  const a = Buffer.from(submittedHash, "hex")
  const b = Buffer.from(storedHash, "hex")
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** ISO timestamp for when the OTP expires (now + TTL). */
export function otpExpiresAt(): string {
  return new Date(Date.now() + OTP_TTL_MS).toISOString()
}

export function isOtpExpired(expiresAt: string): boolean {
  return Date.now() > new Date(expiresAt).getTime()
}
