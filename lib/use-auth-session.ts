"use client"

import { useEffect, useState } from "react"
import { db } from "@/lib/db"

export type AuthSessionInfo = {
  isAdmin: boolean
  isGuestAllowed: boolean
}

export function useAuthSession(): { session: AuthSessionInfo | null; loading: boolean } {
  const user = db.useUser()
  const [session, setSession] = useState<AuthSessionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadSession() {
      setLoading(true)
      try {
        const authUser = await db.getAuth()
        const token = authUser?.refresh_token
        if (!token) {
          if (!cancelled) {
            setSession(null)
            setLoading(false)
          }
          return
        }

        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (cancelled) return

        if (!res.ok) {
          setSession(null)
        } else {
          setSession((await res.json()) as AuthSessionInfo)
        }
      } catch {
        if (!cancelled) setSession(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSession()

    return () => {
      cancelled = true
    }
  }, [user.id])

  return { session, loading }
}
