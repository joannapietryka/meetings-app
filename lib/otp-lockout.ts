export const OTP_LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes after max failed attempts

export function otpLockoutUntil(from = Date.now()): string {
  return new Date(from + OTP_LOCKOUT_MS).toISOString()
}

export function isOtpLocked(lockedUntil?: string | null, now = Date.now()): boolean {
  if (!lockedUntil) return false
  return now < new Date(lockedUntil).getTime()
}

export function otpLockRetryAfterSec(lockedUntil: string, now = Date.now()): number {
  return Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - now) / 1000))
}

export type OtpSessionRecord = {
  id: string
  email: string
  hashedCode: string
  expiresAt: string
  attempts: number
  lockedUntil?: string
}

export function getActiveOtpLock(
  sessions: OtpSessionRecord[],
  now = Date.now(),
): OtpSessionRecord | null {
  return (
    sessions.find((session) => isOtpLocked(session.lockedUntil, now)) ?? null
  )
}

export function getActiveOtpSession(
  sessions: OtpSessionRecord[],
  now = Date.now(),
): OtpSessionRecord | null {
  return (
    sessions.find(
      (session) =>
        !isOtpLocked(session.lockedUntil, now) &&
        now < new Date(session.expiresAt).getTime() &&
        Boolean(session.hashedCode),
    ) ?? null
  )
}
