import {
  n8nMeetingBodySchema,
  n8nMeetingCreatedSchema,
  n8nMeetingDeletedSchema,
  n8nMeetingEditedSchema,
} from "@/lib/schemas/n8n-meetings"

describe("n8n meeting schemas", () => {
  it("accepts meeting.created payload", () => {
    const body = {
      event: "meeting.created" as const,
      meetingId: "m1",
      title: "Anna Kowalska",
      category: "online" as const,
      date: "2026-03-17",
      time: "09:00",
      duration: 50,
      userEmail: "guest@test.com",
      userPhone: "+48500123456",
      createdAt: "2026-03-10T10:00:00.000Z",
    }
    expect(n8nMeetingCreatedSchema.parse(body)).toEqual(body)
  })

  it("accepts meeting.edited payload with nullable previous fields", () => {
    const body = {
      event: "meeting.edited" as const,
      editedBy: "admin" as const,
      meetingId: "m1",
      title: "Anna Kowalska",
      category: "w_gabinecie" as const,
      date: "2026-03-18",
      time: "10:15",
      duration: 50,
      userEmail: "guest@test.com",
      status: "not_confirmed" as const,
      previousDate: "2026-03-17",
      previousTime: "09:00",
      previousDuration: 50,
      changeRequestedAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T10:00:00.000Z",
    }
    expect(n8nMeetingEditedSchema.parse(body)).toEqual(body)
  })

  it("accepts meeting.deleted payload", () => {
    const body = {
      event: "meeting.deleted" as const,
      deletedBy: "user" as const,
      meetingId: "m1",
      title: "Anna Kowalska",
      category: "online" as const,
      date: "2026-03-17",
      time: "09:00",
      duration: 50,
      userEmail: "guest@test.com",
      deletedAt: "2026-03-10T10:00:00.000Z",
    }
    expect(n8nMeetingDeletedSchema.parse(body)).toEqual(body)
  })

  it("rejects unknown fields", () => {
    expect(() =>
      n8nMeetingBodySchema.parse({
        event: "meeting.created",
        meetingId: "m1",
        title: "Test",
        category: "online",
        date: "2026-03-17",
        createdAt: "2026-03-10T10:00:00.000Z",
        extra: "nope",
      }),
    ).toThrow()
  })

  it("rejects invalid event", () => {
    expect(() =>
      n8nMeetingBodySchema.parse({
        event: "meeting.hacked",
        meetingId: "m1",
      }),
    ).toThrow()
  })
})
