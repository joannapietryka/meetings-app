/**
 * GuestDashboard component tests.
 * db.useUser and db.useQuery are mocked; we override them per test.
 */

import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { GuestDashboard } from "@/components/guest/GuestDashboard"
import { db } from "@/lib/db"

const mockUser = { id: "guest-user-1", email: "guest@test.com" }

function mockMeetings(meetings: Array<{ id: string; userId?: string; title: string; category: string; date: string; time?: string; duration?: number }>) {
  ;(db.useUser as jest.Mock).mockReturnValue(mockUser)
  ;(db.useQuery as jest.Mock).mockReturnValue({
    isLoading: false,
    error: null,
    data: { meetings },
  })
}

describe("GuestDashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockMeetings([])
  })

  describe("guest meeting limit (3 meetings)", () => {
    it("shows Add meeting button enabled when user has 0 meetings", () => {
      mockMeetings([])
      render(<GuestDashboard />)
      const addButton = screen.getByRole("button", { name: /add meeting/i })
      expect(addButton).not.toBeDisabled()
      expect(screen.queryByText(/you can schedule up to 3 meetings/i)).not.toBeInTheDocument()
    })

    it("shows Add meeting button enabled when user has 2 meetings", () => {
      mockMeetings([
        { id: "1", userId: mockUser.id, title: "One", category: "bed1", date: "2026-03-17", time: "10:00", duration: 30 },
        { id: "2", userId: mockUser.id, title: "Two", category: "bed2", date: "2026-03-18", time: "11:00", duration: 30 },
      ])
      render(<GuestDashboard />)
      const addButton = screen.getByRole("button", { name: /add meeting/i })
      expect(addButton).not.toBeDisabled()
    })

    it("disables Add meeting button when user has 3 meetings", () => {
      mockMeetings([
        { id: "1", userId: mockUser.id, title: "One", category: "bed1", date: "2026-03-17", time: "10:00", duration: 30 },
        { id: "2", userId: mockUser.id, title: "Two", category: "bed2", date: "2026-03-18", time: "11:00", duration: 30 },
        { id: "3", userId: mockUser.id, title: "Three", category: "contract", date: "2026-03-19", time: "14:00", duration: 60 },
      ])
      render(<GuestDashboard />)
      const addButton = screen.getByRole("button", { name: /add meeting/i })
      expect(addButton).toBeDisabled()
    })

    it("shows info text that only 3 meetings can be scheduled when at limit", () => {
      mockMeetings([
        { id: "1", userId: mockUser.id, title: "One", category: "bed1", date: "2026-03-17", time: "10:00", duration: 30 },
        { id: "2", userId: mockUser.id, title: "Two", category: "bed2", date: "2026-03-18", time: "11:00", duration: 30 },
        { id: "3", userId: mockUser.id, title: "Three", category: "contract", date: "2026-03-19", time: "14:00", duration: 60 },
      ])
      render(<GuestDashboard />)
      expect(screen.getByText(/you can schedule up to 3 meetings/i)).toBeInTheDocument()
    })

    it("does not show limit message when under 3 meetings", () => {
      mockMeetings([
        { id: "1", userId: mockUser.id, title: "One", category: "bed1", date: "2026-03-17", time: "10:00", duration: 30 },
      ])
      render(<GuestDashboard />)
      expect(screen.queryByText(/you can schedule up to 3 meetings/i)).not.toBeInTheDocument()
    })
  })

  describe("header and layout", () => {
    it("renders 'Your meetings' heading", () => {
      render(<GuestDashboard />)
      expect(screen.getByRole("heading", { name: /your meetings/i })).toBeInTheDocument()
    })

    it("renders Log out button", () => {
      render(<GuestDashboard />)
      expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument()
    })
  })

  describe("loading and error", () => {
    it("renders nothing while loading", () => {
      ;(db.useUser as jest.Mock).mockReturnValue(mockUser)
      ;(db.useQuery as jest.Mock).mockReturnValue({ isLoading: true, error: null, data: { meetings: [] } })
      const { container } = render(<GuestDashboard />)
      expect(container.firstChild).toBeNull()
    })

    it("renders error message when useQuery returns error", () => {
      ;(db.useUser as jest.Mock).mockReturnValue(mockUser)
      ;(db.useQuery as jest.Mock).mockReturnValue({
        isLoading: false,
        error: new Error("Network error"),
        data: { meetings: [] },
      })
      render(<GuestDashboard />)
      expect(screen.getByText(/error:/i)).toBeInTheDocument()
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })

  it("fires n8n meeting.deleted with deletedBy=user when guest deletes a meeting", async () => {
    ;(global as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: async () => "",
      } as any)
    )
    const fetchSpy = global.fetch as jest.Mock

    ;(global as any).confirm = jest.fn(() => true)

    mockMeetings([
      {
        id: "m1",
        userId: mockUser.id,
        title: "My Meeting",
        category: "bed1",
        date: "2026-03-17",
        time: "10:00",
        duration: 30,
        // userEmail is not part of the mockMeetings type, but GuestDashboard uses it defensively
      } as any,
    ])

    // Render and click delete on the meeting card
    render(<GuestDashboard />)
    const deleteButton = screen.getByRole("button", { name: /delete/i })
    await userEvent.click(deleteButton)

    expect(fetchSpy).toHaveBeenCalled()
    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe("POST")
    const body = JSON.parse((init as any).body)
    expect(body.event).toBe("meeting.deleted")
    expect(body.deletedBy).toBe("user")
    expect(body.meetingId).toBe("m1")
  })
})
