type InstantAdminError = Error & { status?: number; body?: unknown }
const INSTANT_ADMIN_TIMEOUT_MS = 12000

export async function instantAdminDeleteUser(userId: string): Promise<void> {
  const appId = requireEnv("NEXT_PUBLIC_INSTANT_APP_ID")
  const adminToken = requireEnv("INSTANT_ADMIN_TOKEN")

  const res = await fetch(`https://api.instantdb.com/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "App-Id": appId,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(INSTANT_ADMIN_TIMEOUT_MS),
  })

  if (!res.ok && res.status !== 404) {
    const err: InstantAdminError = new Error("Instant admin delete user failed")
    err.status = res.status
    try {
      err.body = await res.json()
    } catch {
      err.body = await res.text()
    }
    throw err
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

export async function instantAdminQuery<T>(body: unknown): Promise<T> {
  const appId = requireEnv("NEXT_PUBLIC_INSTANT_APP_ID")
  const adminToken = requireEnv("INSTANT_ADMIN_TOKEN")

  const res = await fetch("https://api.instantdb.com/admin/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
      "App-Id": appId,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(INSTANT_ADMIN_TIMEOUT_MS),
  })

  if (!res.ok) {
    const err: InstantAdminError = new Error("Instant admin query failed")
    err.status = res.status
    try {
      err.body = await res.json()
    } catch {
      err.body = await res.text()
    }
    throw err
  }

  return (await res.json()) as T
}

export async function instantAdminTransact(body: { steps: unknown[] }): Promise<unknown> {
  const appId = requireEnv("NEXT_PUBLIC_INSTANT_APP_ID")
  const adminToken = requireEnv("INSTANT_ADMIN_TOKEN")

  const res = await fetch("https://api.instantdb.com/admin/transact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
      "App-Id": appId,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(INSTANT_ADMIN_TIMEOUT_MS),
  })

  if (!res.ok) {
    const err: InstantAdminError = new Error("Instant admin transact failed")
    err.status = res.status
    try {
      err.body = await res.json()
    } catch {
      err.body = await res.text()
    }
    throw err
  }

  return await res.json()
}

