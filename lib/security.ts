import type { NextRequest } from "next/server"

const ORIGIN_PROTECTED_PREFIXES = [
  "/api/account/delete",
  "/api/n8n/meetings",
  "/api/meetings",
] as const

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"])

export function requiresOriginCheck(pathname: string, method: string): boolean {
  if (!MUTATING_METHODS.has(method)) return false
  return ORIGIN_PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

/** When Origin is sent (browser), it must match the request host. */
export function isAllowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true

  const host = request.headers.get("host")
  if (!host) return false

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function getSecurityHeaders(isDev: boolean): Record<string, string> {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.instantdb.com wss://api.instantdb.com",
  ].join("; ")

  return {
    "Content-Security-Policy": csp,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-DNS-Prefetch-Control": "off",
  }
}
