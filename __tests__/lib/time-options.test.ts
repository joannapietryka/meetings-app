import { snapTimeToFullHour, snapTimeToFiveMinutes } from "@/lib/time-options"

describe("time-options", () => {
  it("snaps to full hour on Saturday grid click", () => {
    expect(snapTimeToFullHour("16:23")).toBe("16:00")
    expect(snapTimeToFullHour("16:59")).toBe("16:00")
    expect(snapTimeToFullHour("09:45")).toBe("09:00")
  })

  it("still snaps to 5 minutes in time picker helper", () => {
    expect(snapTimeToFiveMinutes("16:23")).toBe("16:25")
  })
})
