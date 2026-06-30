import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getSecurityHeaders, isAllowedOrigin, requiresOriginCheck } from "@/lib/security"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith("/api/")) {
    if (requiresOriginCheck(pathname, request.method) && !isAllowedOrigin(request)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
  }

  const response = NextResponse.next()
  const headers = getSecurityHeaders(process.env.NODE_ENV !== "production")
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value)
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.png|images/).*)"],
}
