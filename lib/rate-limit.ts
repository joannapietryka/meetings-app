type RateLimitEntry = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number }

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  const existing = store.get(key)
  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  store.set(key, existing)
  return { allowed: true }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = req.headers.get("x-real-ip")?.trim()
  if (realIp) return realIp
  return "unknown"
}

export function rateLimitKey(route: string, ip: string): string {
  return `${route}:${ip}`
}

/** Drop expired entries occasionally so the map does not grow forever. */
export function pruneRateLimitStore(now = Date.now()): void {
  if (store.size < 500) return
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key)
  }
}

export const RATE_LIMITS = {
  sendCode: { limit: 5, windowMs: 15 * 60 * 1000 },
  verifyCode: { limit: 20, windowMs: 15 * 60 * 1000 },
  availability: { limit: 60, windowMs: 60 * 1000 },
  accountDelete: { limit: 3, windowMs: 60 * 60 * 1000 },
  meetingsWrite: { limit: 30, windowMs: 15 * 60 * 1000 },
} as const

export function enforceRateLimit(
  req: Request,
  route: string,
  config: { limit: number; windowMs: number },
): RateLimitResult {
  pruneRateLimitStore()
  const ip = getClientIp(req)
  return checkRateLimit(rateLimitKey(route, ip), config.limit, config.windowMs)
}
