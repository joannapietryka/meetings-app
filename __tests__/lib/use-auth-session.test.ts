/** @jest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react"
import { db } from "@/lib/db"
import { useAuthSession } from "@/lib/use-auth-session"

describe("useAuthSession", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it("loads session via db.getAuth refresh token", async () => {
    ;(db.getAuth as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "admin@test.com",
      refresh_token: "stored-token",
      isGuest: false,
    })
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ isAdmin: true, isGuestAllowed: true }),
    })

    const { result } = renderHook(() => useAuthSession())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/me", {
      headers: { Authorization: "Bearer stored-token" },
    })
    expect(result.current.session).toEqual({ isAdmin: true, isGuestAllowed: true })
  })

  it("does not call /api/auth/me when getAuth has no token", async () => {
    ;(db.getAuth as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "admin@test.com",
      refresh_token: "",
      isGuest: false,
    })

    const { result } = renderHook(() => useAuthSession())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.session).toBeNull()
  })
})
