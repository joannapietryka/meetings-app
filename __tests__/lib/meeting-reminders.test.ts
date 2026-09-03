import {
  addCalendarDays,
  formatDateInTimeZone,
  getReminderTargetDate,
  isMeetingDueForReminder,
  selectMeetingsDueForReminder,
} from "@/lib/meeting-reminders"

describe("meeting-reminders", () => {
  it("formats calendar dates in Europe/Warsaw", () => {
    // 2026-06-15 22:30 UTC → 2026-06-16 in Warsaw (CEST)
    const date = new Date("2026-06-15T22:30:00.000Z")
    expect(formatDateInTimeZone(date, "Europe/Warsaw")).toBe("2026-06-16")
  })

  it("adds calendar days without local timezone drift", () => {
    expect(addCalendarDays("2026-09-03", 2)).toBe("2026-09-05")
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("targets visits two days ahead of Warsaw today", () => {
    const now = new Date("2026-09-03T07:00:00.000Z") // 09:00 Warsaw CEST
    expect(getReminderTargetDate(now)).toBe("2026-09-05")
  })

  it("selects only guest meetings on the target date that were not reminded yet", () => {
    const due = selectMeetingsDueForReminder(
      [
        {
          id: "m1",
          title: "Anna",
          category: "online",
          date: "2026-09-05",
          time: "10:00",
          userEmail: "guest@example.com",
        },
        {
          id: "m2",
          title: "Already reminded",
          category: "online",
          date: "2026-09-05",
          userEmail: "guest2@example.com",
          remindedAt: "2026-09-03T07:00:00.000Z",
        },
        {
          id: "m3",
          title: "Wrong day",
          category: "w_gabinecie",
          date: "2026-09-06",
          userEmail: "guest3@example.com",
        },
        {
          id: "m4",
          title: "Admin only",
          category: "online",
          date: "2026-09-05",
          userEmail: null,
        },
      ],
      "2026-09-05",
    )

    expect(due.map((m) => m.id)).toEqual(["m1"])
    expect(isMeetingDueForReminder(due[0], "2026-09-05")).toBe(true)
  })
})
