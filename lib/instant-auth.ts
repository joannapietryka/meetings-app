import { init } from "@instantdb/admin"
import type { User } from "@instantdb/core"
import { isGuestEmailAllowed } from "@/lib/access-control"
import { isAdminEmail } from "@/lib/admin-emails"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export function getInstantAdminDb() {
  return init({
    appId: requireEnv("NEXT_PUBLIC_INSTANT_APP_ID"),
    adminToken: requireEnv("INSTANT_ADMIN_TOKEN"),
  })
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice("Bearer ".length).trim()
  return token || null
}

export async function verifyRequestUser(req: Request): Promise<User | null> {
  const token = getBearerToken(req)
  if (!token) return null

  try {
    const adminDb = getInstantAdminDb()
    return await adminDb.auth.verifyToken(token)
  } catch {
    return null
  }
}

export async function requireRequestUser(req: Request): Promise<User> {
  const user = await verifyRequestUser(req)
  if (!user) {
    throw new AuthError("Unauthorized", 401)
  }
  return user
}

export class AuthError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "AuthError"
    this.status = status
  }
}

export async function getSessionInfo(user: User): Promise<{
  email: string
  isAdmin: boolean
  isGuestAllowed: boolean
}> {
  const email = (user.email ?? "").trim().toLowerCase()
  const isAdmin = isAdminEmail(email)
  const isGuestAllowed = isAdmin || (email ? await isGuestEmailAllowed(email) : false)
  return { email, isAdmin, isGuestAllowed }
}
