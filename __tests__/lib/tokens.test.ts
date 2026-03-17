import { createMeetingActionToken, verifyMeetingActionToken } from "@/lib/tokens"

describe("meeting action tokens", () => {
  beforeEach(() => {
    process.env.MEETING_ACTION_TOKEN_SECRET = "test-secret"
  })

  it("creates and verifies a confirm token", () => {
    const token = createMeetingActionToken({ meetingId: "m1", action: "confirm", ttlSeconds: 60 })
    const res = verifyMeetingActionToken({ token, meetingId: "m1", action: "confirm" })
    expect(res.ok).toBe(true)
  })

  it("rejects token with wrong action", () => {
    const token = createMeetingActionToken({ meetingId: "m1", action: "confirm", ttlSeconds: 60 })
    const res = verifyMeetingActionToken({ token, meetingId: "m1", action: "decline" })
    expect(res.ok).toBe(false)
  })

  it("rejects expired token", () => {
    const token = createMeetingActionToken({ meetingId: "m1", action: "confirm", ttlSeconds: 1 })
    const spy = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 5_000)
    const res = verifyMeetingActionToken({ token, meetingId: "m1", action: "confirm" })
    expect(res.ok).toBe(false)
    spy.mockRestore()
  })
})

