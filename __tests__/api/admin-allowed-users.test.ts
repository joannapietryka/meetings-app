/** @jest-environment node */
import { POST as grantAccess } from "@/app/api/admin/allowed-users/route"
import { requireRequestUser } from "@/lib/instant-auth"

jest.mock("@/lib/instant-auth", () => ({
  ...jest.requireActual("@/lib/instant-auth"),
  requireRequestUser: jest.fn(),
  getSessionInfo: jest.fn(),
}))

jest.mock("@/lib/instant-admin", () => ({
  instantAdminQuery: jest.fn(),
  instantAdminTransact: jest.fn(),
}))

jest.mock("@/lib/n8n-meetings-webhook", () => ({
  forwardMeetingWebhook: jest.fn(),
}))

const mockRequireRequestUser = requireRequestUser as jest.MockedFunction<typeof requireRequestUser>
const { getSessionInfo } = jest.requireMock("@/lib/instant-auth") as {
  getSessionInfo: jest.Mock
}
const { instantAdminQuery, instantAdminTransact } = jest.requireMock("@/lib/instant-admin") as {
  instantAdminQuery: jest.Mock
  instantAdminTransact: jest.Mock
}
const { forwardMeetingWebhook } = jest.requireMock("@/lib/n8n-meetings-webhook") as {
  forwardMeetingWebhook: jest.Mock
}

function grantRequest(email = "guest@example.com") {
  return new Request("http://localhost/api/admin/allowed-users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer token",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify({ email }),
  })
}

describe("POST /api/admin/allowed-users", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireRequestUser.mockResolvedValue({
      id: "admin_1",
      email: "admin@example.com",
      refresh_token: "token",
    } as any)
    getSessionInfo.mockResolvedValue({
      email: "admin@example.com",
      isAdmin: true,
      isGuestAllowed: true,
    })
    instantAdminQuery.mockResolvedValue({ allowedUsers: [] })
    instantAdminTransact.mockResolvedValue({ ok: true })
    forwardMeetingWebhook.mockResolvedValue({ ok: true, status: 200 })
  })

  it("rejects a non-admin", async () => {
    getSessionInfo.mockResolvedValue({
      email: "guest@example.com",
      isAdmin: false,
      isGuestAllowed: true,
    })

    const res = await grantAccess(grantRequest())
    expect(res.status).toBe(403)
    expect(instantAdminTransact).not.toHaveBeenCalled()
    expect(forwardMeetingWebhook).not.toHaveBeenCalled()
  })

  it("does not notify when the address is already allowed", async () => {
    instantAdminQuery.mockResolvedValue({
      allowedUsers: [{ id: "u1", email: "guest@example.com" }],
    })

    const res = await grantAccess(grantRequest(" Guest@Example.com "))
    expect(res.status).toBe(409)
    expect(instantAdminTransact).not.toHaveBeenCalled()
    expect(forwardMeetingWebhook).not.toHaveBeenCalled()
  })

  it("saves access and forwards access.granted to n8n", async () => {
    const res = await grantAccess(grantRequest())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ ok: true, email: "guest@example.com", notified: true }),
    )
    expect(instantAdminTransact).toHaveBeenCalledWith({
      steps: [
        [
          "update",
          "allowedUsers",
          expect.any(String),
          expect.objectContaining({ email: "guest@example.com" }),
        ],
      ],
    })
    expect(forwardMeetingWebhook).toHaveBeenCalledWith({
      event: "access.granted",
      userEmail: "guest@example.com",
      grantedAt: expect.any(String),
    })
  })
})
