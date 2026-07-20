/**
 * GuestDashboard component tests.
 * db.useUser and db.useQuery are mocked; we override them per test.
 */

import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { GuestDashboard } from "@/components/guest/GuestDashboard"
import { db } from "@/lib/db"
import { DAY_SLOTS } from "@/lib/calendar-types"

const mockUser = {
  id: "guest-user-1",
  email: "guest@test.com",
  refresh_token: "test-refresh-token",
}

jest.mock("@/components/calendar/AddTaskModal", () => ({
  AddTaskModal: (props: {
    defaultDate?: string
    editingTaskId?: string
    initialTitle?: string
    onAdd: (p: Record<string, unknown>) => void
    onClose: () => void
  }) => (
    <div data-testid="add-task-modal">
      <span data-testid="modal-default-date">{props.defaultDate}</span>
      <button
        type="button"
        data-testid="modal-save"
        onClick={() =>
          props.onAdd({
            title: props.initialTitle ?? "Zaktualizowana wizyta",
            description: "Opis zaktualizowanej wizyty",
            category: "online",
            date: props.defaultDate ?? "2026-03-18",
            time: "09:00",
            duration: 50,
          })
        }
      >
        Zapisz (test)
      </button>
      <button type="button" data-testid="modal-close" onClick={() => props.onClose()}>
        Zamknij
      </button>
    </div>
  ),
}))

function mockMeetings(
  meetings: Array<{
    id: string
    userId?: string
    title: string
    category: string
    date: string
    time?: string
    duration?: number
  }>,
) {
  ;(db.useUser as jest.Mock).mockReturnValue(mockUser)
  ;(db.useQuery as jest.Mock).mockImplementation((q: Record<string, unknown>) => {
    if ("meetings" in q) {
      return { isLoading: false, error: null, data: { meetings } }
    }
    if ("blockedDates" in q) {
      return { isLoading: false, error: null, data: { blockedDates: [] } }
    }
    if ("blockedSlots" in q) {
      return { isLoading: false, error: null, data: { blockedSlots: [] } }
    }
    if ("scheduleSlots" in q) {
      return { isLoading: false, error: null, data: { scheduleSlots: [] } }
    }
    if ("bookingSettings" in q) {
      return { isLoading: false, error: null, data: { bookingSettings: [] } }
    }
    return { isLoading: false, error: null, data: {} }
  })
}

function mockFetchWithAvailability(meetings: Array<Record<string, unknown>> = []) {
  ;(global as any).fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("/api/guest/availability")) {
      return {
        ok: true,
        json: async () => ({ meetings }),
      } as any
    }

    return {
      ok: true,
      text: async () => "",
      json: async () => ({}),
    } as any
  })
}

describe("GuestDashboard", () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] })
    jest.setSystemTime(new Date("2026-03-15T12:00:00.000Z"))
    window.sessionStorage.clear()
    window.localStorage.clear()
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    mockMeetings([])
    mockFetchWithAvailability([])
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe("calendar and layout", () => {
    it("renders month calendar", () => {
      mockMeetings([])
      render(<GuestDashboard />)
      expect(screen.getByTestId("guest-calendar")).toBeInTheDocument()
      expect(screen.getByRole("heading", { name: /moje wizyty/i })).toBeInTheDocument()
    })

    it("renders Polish month title", () => {
      mockMeetings([])
      render(<GuestDashboard />)
      expect(screen.getByRole("heading", { name: /marzec 2026/i })).toBeInTheDocument()
    })
  })

  describe("header and layout", () => {
    it("renders Log out button", () => {
      mockMeetings([])
      render(<GuestDashboard />)
      expect(screen.getByRole("button", { name: /wyloguj się/i })).toBeInTheDocument()
    })

    it("renders Add meeting button in the header", () => {
      mockMeetings([])
      render(<GuestDashboard />)
      expect(screen.getByRole("button", { name: /dodaj wizytę/i })).toBeInTheDocument()
    })
  })

  describe("loading and error", () => {
    it("renders nothing while loading", () => {
      ;(db.useUser as jest.Mock).mockReturnValue(mockUser)
      ;(db.useQuery as jest.Mock).mockImplementation((q: Record<string, unknown>) => {
        if ("meetings" in q) {
          return { isLoading: true, error: null, data: { meetings: [] } }
        }
        return { isLoading: false, error: null, data: {} }
      })
      const { container } = render(<GuestDashboard />)
      expect(container.firstChild).toBeNull()
    })

    it("renders error message when useQuery returns error", () => {
      ;(db.useUser as jest.Mock).mockReturnValue(mockUser)
      ;(db.useQuery as jest.Mock).mockImplementation((q: Record<string, unknown>) => {
        if ("meetings" in q) {
          return { isLoading: false, error: new Error("Network error"), data: { meetings: [] } }
        }
        return { isLoading: false, error: null, data: {} }
      })
      render(<GuestDashboard />)
      expect(screen.getByText(/błąd:/i)).toBeInTheDocument()
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })

  it("fires n8n meeting.deleted with deletedBy=user when guest deletes a meeting", async () => {
    mockFetchWithAvailability([])
    const fetchSpy = global.fetch as jest.Mock

    mockMeetings([
      {
        id: "m1",
        userId: mockUser.id,
        title: "Moja wizyta",
        category: "online",
        date: "2026-03-17",
        time: "09:00",
        duration: 50,
      } as any,
    ])

    render(<GuestDashboard />)
    const deleteButton = screen.getByRole("button", { name: /^usuń$/i })
    await user.click(deleteButton)

    const yesButton = await screen.findByRole("button", { name: /^tak$/i })
    await user.click(yesButton)

    expect(fetchSpy).toHaveBeenCalled()
    const n8nCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("/api/n8n/meetings"))
    expect(n8nCall).toBeTruthy()
    const [, init] = n8nCall as any
    expect(init?.method).toBe("POST")
    expect(init?.headers?.Authorization).toBe("Bearer test-refresh-token")
    const body = JSON.parse((init as any).body)
    expect(body.event).toBe("meeting.deleted")
    expect(body.deletedBy).toBe("user")
    expect(body.meetingId).toBe("m1")
  })

  it("saves guest meeting edits through /api/meetings (server fires n8n webhook)", async () => {
    mockFetchWithAvailability([])
    const fetchSpy = global.fetch as jest.Mock

    mockMeetings([
      {
        id: "m1",
        userId: mockUser.id,
        title: "Moja wizyta",
        category: "online",
        date: "2026-03-17",
        time: "09:00",
        duration: 50,
      } as any,
    ])

    render(<GuestDashboard />)

    const editButton = screen.getByRole("button", { name: /edytuj/i })
    await user.click(editButton)

    expect(screen.getByTestId("add-task-modal")).toBeInTheDocument()

    await user.click(screen.getByTestId("modal-save"))

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([url, init]) =>
            String(url).includes("/api/meetings/m1") && (init as any)?.method === "PATCH",
        ),
      ).toBe(true)
    })

    const patchCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/api/meetings/m1") && (init as any)?.method === "PATCH",
    )
    expect(patchCall).toBeTruthy()
    const [, init] = patchCall as any
    expect(init?.headers?.Authorization).toBe("Bearer test-refresh-token")
  })

  it("opens AddTaskModal with selected calendar day as defaultDate", async () => {
    mockMeetings([])
    render(<GuestDashboard />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /dodaj wizytę/i })).not.toBeDisabled()
    })

    await user.click(screen.getByTestId("calendar-day-2026-03-18"))

    await waitFor(() => {
      expect(screen.getByTestId("modal-default-date")).toHaveTextContent("2026-03-18")
    })
  })

  it("rechecks availability before opening a booking and blocks newly occupied days", async () => {
    const date = "2026-03-18"
    const slots = DAY_SLOTS[new Date(date).getDay()] ?? []
    if (slots.length === 0) return

    let availabilityMeetings: Array<Record<string, unknown>> = []
    ;(global as any).fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/guest/availability")) {
        return {
          ok: true,
          json: async () => ({ meetings: availabilityMeetings }),
        } as any
      }

      return {
        ok: true,
        text: async () => "",
        json: async () => ({}),
      } as any
    })

    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {})

    mockMeetings([])
    render(<GuestDashboard />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /dodaj wizytę/i })).not.toBeDisabled()
    })

    availabilityMeetings = slots.map((slot, index) => ({
      id: `taken-${index}`,
      date,
      time: slot,
      duration: 50,
    }))

    await user.click(screen.getByTestId(`calendar-day-${date}`))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Brak wolnych terminów w tym dniu.")
    })
    expect(screen.queryByTestId("add-task-modal")).not.toBeInTheDocument()
    expect(
      ((global.fetch as jest.Mock).mock.calls as Array<[RequestInfo | URL]>).filter(([url]) =>
        String(url).includes("/api/guest/availability"),
      ).length,
    ).toBeGreaterThan(1)

    alertSpy.mockRestore()
  })

  it("shows retry when availability fetch fails and recovers after retry", async () => {
    let availabilityAttempts = 0
    ;(global as any).fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/guest/availability")) {
        availabilityAttempts += 1
        if (availabilityAttempts === 1) {
          throw new Error("Błąd połączenia")
        }
        return {
          ok: true,
          json: async () => ({ meetings: [] }),
        } as any
      }

      return {
        ok: true,
        text: async () => "",
        json: async () => ({}),
      } as any
    })

    render(<GuestDashboard />)

    const retryButton = await screen.findByRole("button", { name: /ponów pobieranie terminów/i })
    expect(retryButton).toBeInTheDocument()

    await user.click(retryButton)

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /ponów pobieranie terminów/i })).not.toBeInTheDocument()
    })
  })

  it("moves past visits to the Minione tab and hides them from the calendar grid", async () => {
    mockMeetings([
      {
        id: "m1",
        userId: mockUser.id,
        title: "Miniona wizyta",
        category: "online",
        date: "2026-03-12",
        time: "09:00",
        duration: 50,
      } as any,
    ])

    render(<GuestDashboard />)

    const pastCell = screen.getByTestId("calendar-day-2026-03-12")
    expect(pastCell).toHaveAttribute("aria-disabled", "true")
    expect(pastCell).not.toHaveTextContent(/miniona wizyta/i)

    expect(screen.getByRole("button", { name: /minione \(1\)/i })).toBeInTheDocument()
    expect(screen.queryByText(/miniona wizyta/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /minione \(1\)/i }))

    expect(screen.getByText(/miniona wizyta/i)).toBeInTheDocument()
    expect(screen.getByText(/minęła/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^edytuj$/i })).not.toBeInTheDocument()
  })

  it("loads past visits in batches of 5 with Zobacz więcej", async () => {
    mockMeetings(
      Array.from({ length: 6 }, (_, index) => ({
        id: `past-${index}`,
        userId: mockUser.id,
        title: `Miniona wizyta ${index + 1}`,
        category: "online",
        date: `2026-03-${String(14 - index).padStart(2, "0")}`,
        time: "09:00",
        duration: 50,
      })) as any,
    )

    render(<GuestDashboard />)

    await user.click(screen.getByRole("button", { name: /minione \(6\)/i }))

    expect(screen.getByText(/miniona wizyta 1/i)).toBeInTheDocument()
    expect(screen.getByText(/miniona wizyta 5/i)).toBeInTheDocument()
    expect(screen.queryByText(/miniona wizyta 6/i)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /zobacz więcej/i })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /zobacz więcej/i }))

    expect(screen.getByText(/miniona wizyta 6/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /zobacz więcej/i })).not.toBeInTheDocument()
  })

  it("shows weekly limit info on disabled dates in a booked week", () => {
    mockMeetings([
      {
        id: "m1",
        userId: mockUser.id,
        title: "Moja wizyta",
        category: "online",
        date: "2026-03-17",
        time: "09:00",
        duration: 50,
      } as any,
    ])

    render(<GuestDashboard />)

    expect(screen.getAllByText(/maks\. 1 wizyta w tygodniu/i).length).toBeGreaterThan(0)
  })

  it("shows 'brak wolnych terminów' on a fully booked day", async () => {
    const date = "2026-03-18"
    const weekday = new Date(date).getDay()
    const slots = DAY_SLOTS[weekday] ?? []
    if (slots.length === 0) return

    mockMeetings([])
    mockFetchWithAvailability(
      slots.map((slot, index) => ({
        id: `taken-${index}`,
        date,
        time: slot,
        duration: 50,
      })),
    )

    render(<GuestDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId("calendar-day-2026-03-18")).toHaveTextContent(/brak wolnych terminów/i)
    })
  })

  it("uses DB scheduleSlots to mark a fully booked day as unavailable", async () => {
    const date = "2026-03-18"
    mockFetchWithAvailability([
      {
        id: "taken-1",
        date,
        time: "12:00",
        duration: 50,
      },
    ])
    ;(db.useUser as jest.Mock).mockReturnValue(mockUser)
    ;(db.useQuery as jest.Mock).mockImplementation((q: Record<string, unknown>) => {
      if ("meetings" in q) {
        return {
          isLoading: false,
          error: null,
          data: {
            meetings: [],
          },
        }
      }
      if ("blockedDates" in q) {
        return { isLoading: false, error: null, data: { blockedDates: [] } }
      }
      if ("blockedSlots" in q) {
        return { isLoading: false, error: null, data: { blockedSlots: [] } }
      }
      if ("scheduleSlots" in q) {
        return {
          isLoading: false,
          error: null,
          data: {
            scheduleSlots: [{ day: 3, slots: JSON.stringify(["12:00"]) }],
          },
        }
      }
      if ("bookingSettings" in q) {
        return { isLoading: false, error: null, data: { bookingSettings: [] } }
      }
      return { isLoading: false, error: null, data: {} }
    })

    render(<GuestDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId("calendar-day-2026-03-18")).toHaveTextContent(/brak wolnych terminów/i)
    })
  })

  it("applies versioned schedule only from effectiveFrom onward", async () => {
    jest.setSystemTime(new Date("2026-05-27T12:00:00"))

    mockFetchWithAvailability([])
    ;(db.useUser as jest.Mock).mockReturnValue(mockUser)
    ;(db.useQuery as jest.Mock).mockImplementation((q: Record<string, unknown>) => {
      if ("meetings" in q) {
        return { isLoading: false, error: null, data: { meetings: [] } }
      }
      if ("blockedDates" in q) {
        return { isLoading: false, error: null, data: { blockedDates: [] } }
      }
      if ("blockedSlots" in q) {
        return { isLoading: false, error: null, data: { blockedSlots: [] } }
      }
      if ("scheduleSlots" in q) {
        return {
          isLoading: false,
          error: null,
          data: {
            scheduleSlots: [
              { day: 3, slots: JSON.stringify(["14:00", "15:00", "16:15"]) },
              {
                day: 3,
                slots: JSON.stringify(["19:15"]),
                effectiveFrom: "2026-06-01",
              },
            ],
          },
        }
      }
      if ("bookingSettings" in q) {
        return { isLoading: false, error: null, data: { bookingSettings: [] } }
      }
      return { isLoading: false, error: null, data: {} }
    })

    jest.setSystemTime(new Date("2026-05-27T12:00:00"))
    render(<GuestDashboard />)

    await waitFor(() => {
      expect(screen.queryByText(/sprawdzam zajęte terminy/i)).not.toBeInTheDocument()
    })

    const mayWednesday = screen.getByTestId("calendar-day-2026-05-27")
    expect(mayWednesday).not.toHaveTextContent(/brak wolnych terminów/i)

    await user.click(screen.getByRole("button", { name: /następny miesiąc/i }))

    const juneWednesday = await screen.findByTestId("calendar-day-2026-06-03")
    expect(juneWednesday).not.toHaveTextContent(/brak wolnych terminów/i)
  })
})
