import { NextResponse } from "next/server"
import { instantAdminQuery, instantAdminTransact } from "@/lib/instant-admin"
import { verifyMeetingActionToken } from "@/lib/tokens"

type Meeting = {
  id: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { meetingId?: string; token?: string }
    const meetingId = body.meetingId
    const token = body.token
    if (!meetingId || !token) {
      return NextResponse.json({ error: "meetingId and token are required" }, { status: 400 })
    }

    const verified = verifyMeetingActionToken({ token, meetingId, action: "decline" })
    if (!verified.ok) {
      return NextResponse.json({ error: "invalid_token", reason: verified.reason }, { status: 401 })
    }

    const q = await instantAdminQuery<{ meetings: Meeting[] }>({
      query: { meetings: { $: { where: { id: meetingId } } } },
    })
    if (!q.meetings || q.meetings.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    await instantAdminTransact({
      steps: [["delete", "meetings", meetingId]],
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: "server_error", message: err?.message ?? "Unknown error" },
      { status: 500 }
    )
  }
}

