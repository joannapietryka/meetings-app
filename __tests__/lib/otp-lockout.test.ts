import {
  OTP_LOCKOUT_MS,
  getActiveOtpLock,
  getActiveOtpSession,
  isOtpLocked,
  otpLockRetryAfterSec,
  otpLockoutUntil,
} from "@/lib/otp-lockout"

describe("otp-lockout", () => {
  const now = new Date("2026-03-10T12:00:00").getTime()

  it("detects active lock", () => {
    const lockedUntil = otpLockoutUntil(now)
    expect(isOtpLocked(lockedUntil, now)).toBe(true)
    expect(isOtpLocked(lockedUntil, now + OTP_LOCKOUT_MS + 1)).toBe(false)
  })

  it("returns retry-after seconds for lock", () => {
    const lockedUntil = otpLockoutUntil(now)
    expect(otpLockRetryAfterSec(lockedUntil, now)).toBe(Math.ceil(OTP_LOCKOUT_MS / 1000))
  })

  it("finds active lock among sessions", () => {
    const sessions = [
      {
        id: "1",
        email: "a@test.com",
        hashedCode: "",
        expiresAt: "2026-03-10T12:05:00.000Z",
        attempts: 5,
        lockedUntil: otpLockoutUntil(now),
      },
    ]
    expect(getActiveOtpLock(sessions, now)?.id).toBe("1")
  })

  it("ignores expired sessions without lock when picking active OTP", () => {
    const sessions = [
      {
        id: "1",
        email: "a@test.com",
        hashedCode: "abc",
        expiresAt: "2026-03-10T11:00:00.000Z",
        attempts: 0,
      },
    ]
    expect(getActiveOtpSession(sessions, now)).toBeNull()
  })

  it("finds active OTP session", () => {
    const sessions = [
      {
        id: "1",
        email: "a@test.com",
        hashedCode: "abc",
        expiresAt: "2026-03-10T12:10:00.000Z",
        attempts: 1,
      },
    ]
    expect(getActiveOtpSession(sessions, now)?.id).toBe("1")
  })
})
