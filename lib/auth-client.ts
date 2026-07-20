"use client"

import { db } from "@/lib/db"

export async function getInstantAuthHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const user = await db.getAuth()
  if (!user?.refresh_token) {
    throw new Error("Not authenticated")
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${user.refresh_token}`,
    ...extra,
  }
}

export async function authedJsonPost(url: string, body: unknown): Promise<Response> {
  const headers = await getInstantAuthHeaders()
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

export async function authedJsonGet(url: string): Promise<Response> {
  const headers = await getInstantAuthHeaders()
  return fetch(url, {
    method: "GET",
    headers,
  })
}

export async function authedJsonPatch(url: string, body: unknown): Promise<Response> {
  const headers = await getInstantAuthHeaders()
  return fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  })
}
