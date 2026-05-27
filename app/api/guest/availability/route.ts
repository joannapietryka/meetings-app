import { NextResponse } from "next/server"
import { instantAdminQuery } from "@/lib/instant-admin"

type Meeting = {
  id: string
  date?: string
  time?: string
  duration?: number
}

function isValidDateStr(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    if (!isValidDateStr(from) || !isValidDateStr(to)) {
      return NextResponse.json(
        { error: "invalid_range", message: "from and to must be YYYY-MM-DD" },
        { status: 400 },
      )
    }

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
  } catch (err: any) {
    console.error("[guest/availability]", err)
    const message =
      err?.name === "TimeoutError" || err?.name === "AbortError"
        ? "Przekroczono czas pobierania dostępności."
        : err?.message ?? "Unknown error"
    return NextResponse.json(
      { error: "server_error", message },
      { status: 500 },
    )
  }
}
