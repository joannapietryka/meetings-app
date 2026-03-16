"use client"
import { useMemo } from "react"
import { db } from "@/lib/db"
import { AdminCalendar } from "@/components/admin/AdminCalendar"
import { GuestDashboard } from "@/components/guest/GuestDashboard"
import { LoginScreen } from "@/components/auth/LoginScreen"

function useIsAdmin(): boolean {
  const user = db.useUser()
  const adminEmails = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? ""
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  }, [])

  return adminEmails.includes((user.email ?? "").toLowerCase())
}

function RoleRouter() {
  const isAdmin = useIsAdmin()

  return (
    <>
      {isAdmin ? <AdminCalendar /> : <GuestDashboard />}
    </>
  )
}

export default function HomePage() {
  return (
    <>
      <db.SignedIn>
        <RoleRouter />
      </db.SignedIn>
      <db.SignedOut>
        <LoginScreen />
      </db.SignedOut>
    </>
  )
}
