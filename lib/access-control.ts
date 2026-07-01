import { instantAdminQuery } from "@/lib/instant-admin"
import { isAdminEmail } from "@/lib/admin-emails"

type AllowedUser = { email: string }

export async function isGuestEmailAllowed(email: string): Promise<boolean> {
  const lower = email.trim().toLowerCase()
  if (!lower) return false
  if (isAdminEmail(lower)) return true

  const result = await instantAdminQuery<{ allowedUsers: AllowedUser[] }>({
    query: { allowedUsers: {} },
  })
  return (result.allowedUsers ?? []).some((u) => u.email.toLowerCase() === lower)
}
