import { getAdminEmails, isAdminEmail } from "@/lib/admin-emails"

describe("admin-emails", () => {
  const originalAdmin = process.env.ADMIN_EMAILS

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdmin
  })

  it("reads ADMIN_EMAILS server-side list", () => {
    process.env.ADMIN_EMAILS = " Admin@Example.com , other@test.com "
    expect(getAdminEmails()).toEqual(["admin@example.com", "other@test.com"])
    expect(isAdminEmail("Admin@Example.com")).toBe(true)
  })

  it("does not read NEXT_PUBLIC_ADMIN_EMAILS", () => {
    delete process.env.ADMIN_EMAILS
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = "legacy@test.com"
    expect(getAdminEmails()).toEqual([])
    expect(isAdminEmail("legacy@test.com")).toBe(false)
  })

  it("returns empty list when ADMIN_EMAILS unset", () => {
    delete process.env.ADMIN_EMAILS
    expect(getAdminEmails()).toEqual([])
  })
})
