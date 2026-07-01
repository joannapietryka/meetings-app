/** @jest-environment node */
import { POST as deleteAccount } from "@/app/api/account/delete/route"
import { POST as n8nMeetings } from "@/app/api/n8n/meetings/route"
import { AuthError, requireRequestUser } from "@/lib/instant-auth"

jest.mock("@/lib/instant-auth", () => ({
  ...jest.requireActual("@/lib/instant-auth"),
  requireRequestUser: jest.fn(),
  getSessionInfo: jest.fn(),
}))

jest.mock("@/lib/instant-admin", () => ({
  instantAdminQuery: jest.fn(async () => ({ meetings: [], allowedUsers: [] })),
  instantAdminTransact: jest.fn(async () => ({})),
  instantAdminDeleteUser: jest.fn(async () => undefined),
}))

const mockRequireRequestUser = requireRequestUser as jest.MockedFunction<typeof requireRequestUser>
const { getSessionInfo } = jest.requireMock("@/lib/instant-auth") as {
  getSessionInfo: jest.Mock
}

describe("secured API routes", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("rejects account delete without auth", async () => {
    mockRequireRequestUser.mockRejectedValue(new AuthError("Unauthorized", 401))

    const res = await deleteAccount(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u1", userEmail: "a@test.com" }),
      }),
    )

    expect(res.status).toBe(401)
  })

  it("rejects account delete when userId does not match token", async () => {
    mockRequireRequestUser.mockResolvedValue({
      id: "other-user",
      email: "a@test.com",
      refresh_token: "t",
      isGuest: false,
    })

    const res = await deleteAccount(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
        },
        body: JSON.stringify({ userId: "u1", userEmail: "a@test.com" }),
      }),
    )

    expect(res.status).toBe(403)
  })

  it("rejects n8n proxy without auth", async () => {
    mockRequireRequestUser.mockRejectedValue(new AuthError("Unauthorized", 401))

    const res = await n8nMeetings(
      new Request("http://localhost/api/n8n/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "meeting.created" }),
      }),
    )

    expect(res.status).toBe(401)
  })

  it("rejects n8n proxy for disallowed session", async () => {
    mockRequireRequestUser.mockResolvedValue({
      id: "u1",
      email: "a@test.com",
      refresh_token: "t",
      isGuest: false,
    })
    getSessionInfo.mockResolvedValue({
      email: "a@test.com",
      isAdmin: false,
      isGuestAllowed: false,
    })

    const res = await n8nMeetings(
      new Request("http://localhost/api/n8n/meetings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
        },
        body: JSON.stringify({ event: "meeting.created" }),
      }),
    )

    expect(res.status).toBe(403)
  })
})
