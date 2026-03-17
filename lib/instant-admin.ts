type InstantAdminError = Error & { status?: number; body?: unknown }

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

