/** @jest-environment node */
import { GET as meetingRemindersCron } from "@/app/api/cron/meeting-reminders/route"

jest.mock("@/lib/instant-admin", () => ({
  instantAdminQuery: jest.fn(),
  instantAdminTransact: jest.fn(),
}))

jest.mock("@/lib/n8n-meetings-webhook", () => ({
  forwardMeetingWebhook: jest.fn(),
}))

jest.mock("@/lib/meeting-reminders", () => {
  const actual = jest.requireActual("@/lib/meeting-reminders")
  return {
    ...actual,
    getReminderTargetDate: jest.fn(() => "2026-09-05"),
  }
})

const { instantAdminQuery, instantAdminTransact } = jest.requireMock("@/lib/instant-admin") as {
  instantAdminQuery: jest.Mock
  instantAdminTransact: jest.Mock
}
const { forwardMeetingWebhook } = jest.requireMock("@/lib/n8n-meetings-webhook") as {
  forwardMeetingWebhook: jest.Mock
}

describe("GET /api/cron/meeting-reminders", () => {
  const originalEnv = {
    cronSecret: process.env.CRON_SECRET,
    webhookUrl: process.env.N8N_MEETINGS_WEBHOOK_URL,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CRON_SECRET = "cron-test-secret"
    process.env.N8N_MEETINGS_WEBHOOK_URL = "https://n8n.example.com/webhook/meetings"
    forwardMeetingWebhook.mockResolvedValue({ ok: true, status: 200 })
    instantAdminTransact.mockResolvedValue({ ok: true })
  })

  afterAll(() => {
    process.env.CRON_SECRET = originalEnv.cronSecret
    process.env.N8N_MEETINGS_WEBHOOK_URL = originalEnv.webhookUrl
  })

  it("rejects unauthorized cron calls", async () => {
    const res = await meetingRemindersCron(
      new Request("http://localhost/api/cron/meeting-reminders", { method: "GET" }),
    )
    expect(res.status).toBe(401)
  })

  it("sends guest reminders for visits in two days and marks remindedAt", async () => {
    instantAdminQuery.mockResolvedValue({
      meetings: [
        {
          id: "m1",
          title: "Anna Kowalska",
          category: "online",
          date: "2026-09-05",
          time: "10:00",
          duration: 50,
          userEmail: "Guest@Example.com",
          userPhone: "+48500123456",
        },
        {
          id: "m2",
          title: "No email",
          category: "online",
          date: "2026-09-05",
          userEmail: null,
        },
      ],
    })

    const res = await meetingRemindersCron(
      new Request("http://localhost/api/cron/meeting-reminders", {
        method: "GET",
        headers: { Authorization: "Bearer cron-test-secret" },
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      ok: true,
      targetDate: "2026-09-05",
      reminderDaysBefore: 2,
      due: 1,
      sent: 1,
      sentMeetingIds: ["m1"],
      failed: [],
    })

    expect(forwardMeetingWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "meeting.reminder",
        meetingId: "m1",
        userEmail: "guest@example.com",
        reminderDaysBefore: 2,
        targetDate: "2026-09-05",
        date: "2026-09-05",
      }),
    )
    expect(instantAdminTransact).toHaveBeenCalledWith({
      steps: [
        [
          "update",
          "meetings",
          "m1",
          expect.objectContaining({
            remindedAt: expect.any(String),
            updatedAt: expect.any(String),
          }),
        ],
      ],
    })
  })
})
