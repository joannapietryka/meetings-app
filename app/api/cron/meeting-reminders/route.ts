import { NextResponse } from "next/server"
import { instantAdminQuery, instantAdminTransact } from "@/lib/instant-admin"
import { forwardMeetingWebhook } from "@/lib/n8n-meetings-webhook"
import {
  REMINDER_DAYS_BEFORE,
  getReminderTargetDate,
  selectMeetingsDueForReminder,
  type ReminderMeeting,
} from "@/lib/meeting-reminders"
import { unauthorizedResponse, serverErrorResponse } from "@/lib/api-response"

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get("authorization") === `Bearer ${secret}`
}

async function runMeetingReminders() {
  const targetDate = getReminderTargetDate()
  const result = await instantAdminQuery<{ meetings: ReminderMeeting[] }>({
    query: { meetings: {} },
  })

  const due = selectMeetingsDueForReminder(result.meetings ?? [], targetDate)
  const sent: string[] = []
  const failed: Array<{ meetingId: string; error: string }> = []

  for (const meeting of due) {
    const remindedAt = new Date().toISOString()
    const webhook = await forwardMeetingWebhook({
      event: "meeting.reminder",
      meetingId: meeting.id,
      title: meeting.title,
      description: meeting.description,
      category: meeting.category,
      date: meeting.date,
      time: meeting.time,
      duration: meeting.duration,
      userEmail: meeting.userEmail.trim().toLowerCase(),
      userPhone: meeting.userPhone ?? null,
      reminderDaysBefore: REMINDER_DAYS_BEFORE,
      targetDate,
      remindedAt,
    })

    if (!webhook.ok) {
      failed.push({ meetingId: meeting.id, error: webhook.error })
      continue
    }

    try {
      await instantAdminTransact({
        steps: [["update", "meetings", meeting.id, { remindedAt, updatedAt: remindedAt }]],
      })
      sent.push(meeting.id)
    } catch (err) {
      console.error("[cron/meeting-reminders] mark remindedAt failed", meeting.id, err)
      failed.push({ meetingId: meeting.id, error: "mark_reminded_failed" })
    }
  }

  return {
    ok: true,
    targetDate,
    reminderDaysBefore: REMINDER_DAYS_BEFORE,
    checked: (result.meetings ?? []).length,
    due: due.length,
    sent: sent.length,
    sentMeetingIds: sent,
    failed,
  }
}

export async function GET(req: Request) {
  try {
    if (!isAuthorizedCron(req)) return unauthorizedResponse()
    if (!process.env.N8N_MEETINGS_WEBHOOK_URL) {
      return NextResponse.json({ error: "missing_webhook_url" }, { status: 500 })
    }

    const summary = await runMeetingReminders()
    return NextResponse.json(summary)
  } catch (err) {
    return serverErrorResponse("cron/meeting-reminders", err)
  }
}

export async function POST(req: Request) {
  return GET(req)
}
