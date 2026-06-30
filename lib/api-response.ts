import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { publicServerErrorMessage } from "@/lib/api-errors"
import type { RateLimitResult } from "@/lib/rate-limit"

export function rateLimitResponse(result: Extract<RateLimitResult, { allowed: false }>) {
  return NextResponse.json(
    { error: "rate_limited", retryAfterSec: result.retryAfterSec },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSec) },
    },
  )
}

export function validationErrorResponse(error: ZodError) {
  return NextResponse.json(
    {
      error: "validation_error",
      message: error.issues[0]?.message ?? "Invalid request",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400 },
  )
}

export function bookingErrorResponse(code: string, message: string, status = 409) {
  return NextResponse.json({ error: code, message }, { status })
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 })
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 })
}

export function serverErrorResponse(scope: string, err: unknown) {
  console.error(`[${scope}]`, err)
  return NextResponse.json(
    { error: "server_error", message: publicServerErrorMessage(err) },
    { status: 500 },
  )
}

export async function parseJsonBody<T>(
  req: Request,
  schema: { parse: (data: unknown) => T },
): Promise<T> {
  const raw = await req.json()
  return schema.parse(raw)
}
