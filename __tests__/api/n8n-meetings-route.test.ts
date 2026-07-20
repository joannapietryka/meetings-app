/** @jest-environment node */
import { POST as n8nMeetings } from "@/app/api/n8n/meetings/route"
import { requireRequestUser } from "@/lib/instant-auth"

jest.mock("@/lib/instant-auth", () => ({
  ...jest.requireActual("@/lib/instant-auth"),
  requireRequestUser: jest.fn(),
  getSessionInfo: jest.fn(),
}))

const mockRequireRequestUser = requireRequestUser as jest.MockedFunction<typeof requireRequestUser>
const { getSessionInfo } = jest.requireMock("@/lib/instant-auth") as {
  getSessionInfo: jest.Mock
}

describe("POST /api/n8n/meetings", () => {
  const originalEnv = {
    webhookUrl: process.env.N8N_MEETINGS_WEBHOOK_URL,
    authHeaderName: process.env.N8N_MEETINGS_AUTH_HEADER_NAME,
    authHeaderValue: process.env.N8N_MEETINGS_AUTH_HEADER_VALUE,
    adminEmails: process.env.ADMIN_EMAILS,
  }
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireRequestUser.mockResolvedValue({
      id: "user_1",
      email: "guest@example.com",
      refresh_token: "token",
      isGuest: true,
    } as any)
    getSessionInfo.mockResolvedValue({
      email: "guest@example.com",
      isAdmin: false,
      isGuestAllowed: true,
    })
    process.env.N8N_MEETINGS_WEBHOOK_URL = "https://n8n.katarzynapietryka.com/webhook/meetings"
    process.env.N8N_MEETINGS_AUTH_HEADER_NAME = "X-Webhook-Secret"
    process.env.N8N_MEETINGS_AUTH_HEADER_VALUE = "super-secret"
    process.env.ADMIN_EMAILS = "admin@example.com,other@example.com"
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch
  })

  afterAll(() => {
    global.fetch = originalFetch
    process.env.N8N_MEETINGS_WEBHOOK_URL = originalEnv.webhookUrl
    process.env.N8N_MEETINGS_AUTH_HEADER_NAME = originalEnv.authHeaderName
    process.env.N8N_MEETINGS_AUTH_HEADER_VALUE = originalEnv.authHeaderValue
    process.env.ADMIN_EMAILS = originalEnv.adminEmails
  })

  it("forwards a validated meeting payload to the configured n8n webhook", async () => {
    const req = new Request("http://localhost/api/n8n/meetings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({
        event: "meeting.created",
        meetingId: "m1",
        title: "Anna Kowalska",
        description: "First visit",
        category: "online",
        date: "2026-03-17",
        time: "09:00",
        duration: 50,
        userEmail: "guest@example.com",
        userPhone: "+48500123456",
        createdAt: "2026-03-10T10:00:00.000Z",
      }),
    })

    const res = await n8nMeetings(req)

    expect(res.status).toBe(202)
    expect(global.fetch).toHaveBeenCalledWith(
      "https://n8n.katarzynapietryka.com/webhook/meetings",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": "super-secret",
        },
        body: JSON.stringify({
          event: "meeting.created",
          meetingId: "m1",
          title: "Anna Kowalska",
          description: "First visit",
          category: "online",
          date: "17.03.2026",
          time: "09:00",
          duration: 50,
          userEmail: "guest@example.com",
          userPhone: "+48500123456",
          createdAt: "2026-03-10T10:00:00.000Z",
          adminEmails: "admin@example.com,other@example.com",
        }),
        cache: "no-store",
      }),
    )
    await expect(res.json()).resolves.toEqual({ ok: true })
  })

  it("formats date and previousDate as DD.MM.YYYY for meeting.edited payloads", async () => {
    const req = new Request("http://localhost/api/n8n/meetings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
        "x-forwarded-for": "203.0.113.12",
      },
      body: JSON.stringify({
        event: "meeting.edited",
        editedBy: "admin",
        meetingId: "m1",
        title: "Anna Kowalska",
        category: "online",
        date: "2026-08-06",
        time: "09:00",
        duration: 50,
        userEmail: "guest@example.com",
        previousDate: "2026-08-05",
        previousTime: "10:00",
        previousDuration: 50,
        updatedAt: "2026-03-10T10:00:00.000Z",
      }),
    })

    const res = await n8nMeetings(req)

    expect(res.status).toBe(202)
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const forwarded = JSON.parse(init.body as string)
    expect(forwarded.date).toBe("06.08.2026")
    expect(forwarded.previousDate).toBe("05.08.2026")
  })

  it("returns a server error when the webhook URL is missing", async () => {
    delete process.env.N8N_MEETINGS_WEBHOOK_URL

    const req = new Request("http://localhost/api/n8n/meetings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
        "x-forwarded-for": "203.0.113.11",
      },
      body: JSON.stringify({
        event: "meeting.deleted",
        deletedBy: "user",
        meetingId: "m1",
        title: "Anna Kowalska",
        category: "online",
        date: "2026-03-17",
        userEmail: "guest@example.com",
        deletedAt: "2026-03-10T10:00:00.000Z",
      }),
    })

    const res = await n8nMeetings(req)

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: "missing_webhook_url" })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
