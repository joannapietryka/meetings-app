import { NextResponse } from "next/server"
import { instantAdminQuery } from "@/lib/instant-admin"
import {
  rateLimitResponse,
  serverErrorResponse,
  validationErrorResponse,
} from "@/lib/api-response"
import { dateRangeQuerySchema } from "@/lib/schemas/auth"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ZodError } from "zod"

type Meeting = {
  id: string
  date?: string
  time?: string
  duration?: number
}

export async function GET(req: Request) {
  const rate = enforceRateLimit(req, "guest:availability", RATE_LIMITS.availability)
  if (!rate.allowed) return rateLimitResponse(rate)

  try {
    const { searchParams } = new URL(req.url)
    const { from, to } = dateRangeQuerySchema.parse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    })

    const result = await instantAdminQuery<{ meetings: Meeting[] }>({
      query: { meetings: {} },
    })

    const meetings = (result.meetings ?? [])
      .filter((meeting) => meeting.date && meeting.time)
      .filter((meeting) => meeting.date! >= from && meeting.date! <= to)
      .map((meeting) => ({
        id: meeting.id,
        date: meeting.date!,
        time: meeting.time!,
        duration: meeting.duration,
      }))

    return NextResponse.json(
      { meetings },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  } catch (err) {
    if (err instanceof ZodError) return validationErrorResponse(err)
    const message =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
        ? "Przekroczono czas pobierania dostępności."
        : undefined
    if (message) {
      return NextResponse.json({ error: "timeout", message }, { status: 504 })
    }
    return serverErrorResponse("guest/availability", err)
  }
}
