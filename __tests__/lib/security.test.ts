import { isAllowedOrigin, requiresOriginCheck } from "@/lib/security"

function makeRequest(url: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  const headers = new Map(Object.entries(init.headers ?? {}))
  return {
    nextUrl: new URL(url),
    method: init.method ?? "GET",
    headers: {
      get: (key: string) => headers.get(key) ?? null,
    },
  } as unknown as import("next/server").NextRequest
}

describe("security helpers", () => {
  it("requires origin check for mutating protected routes", () => {
    expect(requiresOriginCheck("/api/meetings", "POST")).toBe(true)
    expect(requiresOriginCheck("/api/meetings/abc", "PATCH")).toBe(true)
    expect(requiresOriginCheck("/api/auth/send-code", "POST")).toBe(false)
    expect(requiresOriginCheck("/api/meetings", "GET")).toBe(false)
  })

  it("allows missing Origin header", () => {
    const req = makeRequest("https://app.example/api/meetings", { method: "POST" })
    expect(isAllowedOrigin(req)).toBe(true)
  })

  it("allows matching Origin", () => {
    const req = makeRequest("https://app.example/api/meetings", {
      method: "POST",
      headers: {
        origin: "https://app.example",
        host: "app.example",
      },
    })
    expect(isAllowedOrigin(req)).toBe(true)
  })

  it("rejects mismatched Origin", () => {
    const req = makeRequest("https://app.example/api/meetings", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        host: "app.example",
      },
    })
    expect(isAllowedOrigin(req)).toBe(false)
  })
})
