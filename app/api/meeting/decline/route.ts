import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { instantAdminQuery, instantAdminTransact } from "@/lib/instant-admin"
import { verifyMeetingActionToken } from "@/lib/tokens"
import {
  parseJsonBody,
  serverErrorResponse,
  validationErrorResponse,
} from "@/lib/api-response"
import { meetingActionBodySchema } from "@/lib/schemas/auth"

type Meeting = {
  id: string
}

export async function POST(req: Request) {
  try {
    const { meetingId, token } = await parseJsonBody(req, meetingActionBodySchema)

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
  } catch (err) {
    if (err instanceof ZodError) return validationErrorResponse(err)
    return serverErrorResponse("meeting/decline", err)
  }
}
