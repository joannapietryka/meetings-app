import { NextResponse } from "next/server"
import {
  instantAdminQuery,
  instantAdminTransact,
  instantAdminDeleteUser,
} from "@/lib/instant-admin"

type Meeting = { id: string; userId?: string }
type AllowedUser = { id: string; email: string }

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { userId?: string; userEmail?: string }
    const { userId, userEmail } = body

    if (!userId || !userEmail) {
      return NextResponse.json({ error: "userId and userEmail are required" }, { status: 400 })
    }

    // 1. Find all meetings belonging to this user and anonymize them
    const meetingsResult = await instantAdminQuery<{ meetings: Meeting[] }>({
      query: { meetings: {} },
    })

    const userMeetings = (meetingsResult.meetings ?? []).filter((m) => m.userId === userId)

    const meetingSteps = userMeetings.map((m) => [
      "update",
      "meetings",
      m.id,
      { userId: null, userEmail: "[konto usunięte]" },
    ])

    // 2. Find the user's allowedUsers entry and delete it
    const allowedResult = await instantAdminQuery<{ allowedUsers: AllowedUser[] }>({
      query: { allowedUsers: {} },
    })

    const allowedEntry = (allowedResult.allowedUsers ?? []).find(
      (u) => u.email.toLowerCase() === userEmail.toLowerCase()
    )

    const allowedSteps = allowedEntry
      ? [["delete", "allowedUsers", allowedEntry.id]]
      : []

    // Run all DB steps in one transaction
    if (meetingSteps.length > 0 || allowedSteps.length > 0) {
      await instantAdminTransact({ steps: [...meetingSteps, ...allowedSteps] })
    }

    // 3. Delete the InstantDB auth user account
    await instantAdminDeleteUser(userId)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("[account/delete]", err)
    return NextResponse.json(
      { error: "server_error", message: err?.message ?? "Unknown error" },
      { status: 500 }
    )
  }
}
