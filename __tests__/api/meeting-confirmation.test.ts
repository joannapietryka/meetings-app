/** @jest-environment node */
import { POST as confirmPOST } from "@/app/api/meeting/confirm/route"
import { POST as declinePOST } from "@/app/api/meeting/decline/route"

jest.mock("@/lib/instant-admin", () => ({
  instantAdminQuery: jest.fn(),
  instantAdminTransact: jest.fn(),
}))

jest.mock("@/lib/tokens", () => ({
  verifyMeetingActionToken: jest.fn(),
}))

const { instantAdminQuery, instantAdminTransact } = jest.requireMock("@/lib/instant-admin") as {
  instantAdminQuery: jest.Mock
  instantAdminTransact: jest.Mock
}
const { verifyMeetingActionToken } = jest.requireMock("@/lib/tokens") as {
  verifyMeetingActionToken: jest.Mock
}

describe("meeting confirm/decline API", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.NEXT_PUBLIC_INSTANT_APP_ID = "app_test"
    process.env.INSTANT_ADMIN_TOKEN = "admin_test"
  })

  it("confirms a meeting", async () => {
    verifyMeetingActionToken.mockReturnValue({ ok: true, payload: { meetingId: "m1", action: "confirm", exp: 9999999999 } })
    instantAdminQuery.mockResolvedValue({ meetings: [{ id: "m1" }] })
    instantAdminTransact.mockResolvedValue({ ok: true })

    const res = await confirmPOST(
      new Request("http://localhost/api/meeting/confirm", {
        method: "POST",
        body: JSON.stringify({ meetingId: "m1", token: "tok" }),
        headers: { "Content-Type": "application/json" },
      })
    )

    expect(res.status).toBe(200)
    expect(instantAdminTransact).toHaveBeenCalled()
  })

  it("declines a meeting", async () => {
    verifyMeetingActionToken.mockReturnValue({ ok: true, payload: { meetingId: "m1", action: "decline", exp: 9999999999 } })
    instantAdminQuery.mockResolvedValue({ meetings: [{ id: "m1" }] })
    instantAdminTransact.mockResolvedValue({ ok: true })

    const res = await declinePOST(
      new Request("http://localhost/api/meeting/decline", {
        method: "POST",
        body: JSON.stringify({ meetingId: "m1", token: "tok" }),
        headers: { "Content-Type": "application/json" },
      })
    )

    expect(res.status).toBe(200)
    expect(instantAdminTransact).toHaveBeenCalledWith({ steps: [["delete", "meetings", "m1"]] })
  })
})

