import {
  checkRateLimit,
  rateLimitKey,
  RATE_LIMITS,
} from "@/lib/rate-limit"

describe("rate-limit", () => {
  it("allows requests under the limit", () => {
    const key = rateLimitKey("test", "127.0.0.1")
    const now = 1_000_000
    expect(checkRateLimit(key, 3, 60_000, now).allowed).toBe(true)
    expect(checkRateLimit(key, 3, 60_000, now + 1).allowed).toBe(true)
    expect(checkRateLimit(key, 3, 60_000, now + 2).allowed).toBe(true)
  })

  it("blocks requests over the limit", () => {
    const key = rateLimitKey("test-block", "127.0.0.2")
    const now = 2_000_000
    checkRateLimit(key, 2, 60_000, now)
    checkRateLimit(key, 2, 60_000, now + 1)
    const blocked = checkRateLimit(key, 2, 60_000, now + 2)
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0)
    }
  })

  it("resets after the window", () => {
    const key = rateLimitKey("test-reset", "127.0.0.3")
    const now = 3_000_000
    checkRateLimit(key, 1, 1_000, now)
    const blocked = checkRateLimit(key, 1, 1_000, now + 1)
    expect(blocked.allowed).toBe(false)
    expect(checkRateLimit(key, 1, 1_000, now + 1_001).allowed).toBe(true)
  })

  it("defines auth rate limits", () => {
    expect(RATE_LIMITS.sendCode.limit).toBe(5)
    expect(RATE_LIMITS.verifyCode.limit).toBe(20)
    expect(RATE_LIMITS.availability.limit).toBe(60)
  })
})
