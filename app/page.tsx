"use client"

import { useMemo, useState } from "react"
import { db } from "@/lib/db"
import { AdminCalendar } from "@/components/admin/AdminCalendar"
import { AdminSettings } from "@/components/admin/AdminSettings"
import { GuestDashboard } from "@/components/guest/GuestDashboard"
import { LoginScreen } from "@/components/auth/LoginScreen"

type AdminView = "calendar" | "settings"

function useIsAdmin(): boolean {
  const user = db.useUser()
  const adminEmails = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? ""
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  }, [])
  return adminEmails.includes((user?.email ?? "").toLowerCase())
}

function useIsAllowedGuest(): { allowed: boolean; loading: boolean } {
  const user = db.useUser()
  const { isLoading, data } = db.useQuery({ allowedUsers: {} })
  return useMemo(() => {
    if (isLoading) return { allowed: false, loading: true }
    const list = (data?.allowedUsers ?? []) as unknown as { email: string }[]
    // Empty list → no one is allowed (admin must explicitly whitelist patients)
    if (list.length === 0) return { allowed: false, loading: false }
    const email = (user?.email ?? "").toLowerCase()
    return { allowed: list.some((u) => u.email.toLowerCase() === email), loading: false }
  }, [isLoading, data, user])
}

function AccessDenied() {
  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center before:content-[''] before:absolute before:inset-0 before:bg-[url('/images/x-bg.webp')] before:bg-cover before:bg-center before:opacity-80 before:z-[-1]"
    >
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl p-8 text-center shadow-2xl"
        style={{
          background: "rgba(255,255,255,0.6)",
          backdropFilter: "blur(40px) saturate(200%)",
          border: "1px solid rgba(255,255,255,0.7)",
        }}
      >
        <p className="text-slate-800 font-bold text-lg font-sans mb-4 leading-snug">
          Tylko autoryzowani pacjenci mogą rezerwować wizyty przez system online, jeżeli chcesz umówić pierwszą wizytę napisz email lub sms
        </p>
        <button
          onClick={() => db.auth.signOut()}
          className="px-5 py-2.5 rounded-xl text-sm font-bold font-sans text-white transition hover:-translate-y-0.5"
          style={{ backgroundColor: "#0C115B", border: "1px solid rgba(12,17,91,0.6)" }}
        >
          Wyloguj się
        </button>
      </div>
    </div>
  )
}

function RoleRouter({
  adminView,
  setAdminView,
}: {
  adminView: AdminView
  setAdminView: (v: AdminView) => void
}) {
  const isAdmin = useIsAdmin()
  const { allowed, loading } = useIsAllowedGuest()

  if (isAdmin) {
    if (adminView === "settings") {
      return <AdminSettings onBack={() => setAdminView("calendar")} />
    }
    return <AdminCalendar onOpenSettings={() => setAdminView("settings")} />
  }

  if (loading) return null
  if (!allowed) return <AccessDenied />
  return <GuestDashboard />
}

export default function HomePage() {
  const [adminView, setAdminView] = useState<AdminView>("calendar")

  return (
    <>
      <db.SignedIn>
        <RoleRouter adminView={adminView} setAdminView={setAdminView} />
      </db.SignedIn>
      <db.SignedOut>
        <LoginScreen />
      </db.SignedOut>
    </>
  )
}
