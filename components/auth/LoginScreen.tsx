"use client"

import React, { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { db } from "@/lib/db"

type Step = "email" | "code" | "access_denied"

export function LoginScreen() {
  const [step, setStep] = useState<Step>("email")
  const [sentEmail, setSentEmail] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [codeError, setCodeError] = useState("")
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  const { isLoading: isLoadingUsers, data: userData } = db.useQuery({ allowedUsers: {} })

  const adminEmails = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? ""
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  }, [])

  function isEmailAllowed(email: string): boolean {
    const lower = email.toLowerCase()
    if (adminEmails.includes(lower)) return true
    const list = (userData?.allowedUsers ?? []) as unknown as { email: string }[]
    return list.some((u) => u.email.toLowerCase() === lower)
  }

  const inputStyle: React.CSSProperties = useMemo(
    () => ({
      background: "rgba(255,255,255,0.55)",
      border: "1px solid rgba(0,0,0,0.1)",
      backdropFilter: "blur(10px)",
      color: "#1e293b",
      outline: "none",
    }),
    []
  )

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    const email = emailRef.current?.value?.trim() ?? ""
    if (!email) return

    // Client-side pre-check to avoid a round-trip for obvious rejections
    if (!isLoadingUsers && !isEmailAllowed(email)) {
      setStep("access_denied")
      return
    }

    setIsSending(true)
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (res.status === 403 || data.error === "not_allowed") {
        setStep("access_denied")
        return
      }
      if (res.status === 429) {
        const secs = data.retryAfterSec ?? 300
        const mins = Math.ceil(secs / 60)
        alert(`Kod został już wysłany. Spróbuj ponownie za ${mins} min.`)
        return
      }
      if (!res.ok) {
        alert("Błąd serwera. Spróbuj ponownie.")
        return
      }

      setSentEmail(email)
      setCodeError("")
      setAttemptsRemaining(null)
      setStep("code")
    } catch {
      alert("Błąd połączenia. Spróbuj ponownie.")
    } finally {
      setIsSending(false)
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    const code = codeRef.current?.value?.trim() ?? ""
    if (!code) return

    setIsVerifying(true)
    setCodeError("")
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sentEmail, code }),
      })

      const data = await res.json()

      if (res.status === 410 || data.error === "code_expired") {
        setStep("email")
        setSentEmail("")
        alert("Kod wygasł (ważny 5 minut). Wyślij nowy kod.")
        return
      }
      if (res.status === 429 || data.error === "too_many_attempts") {
        setStep("email")
        setSentEmail("")
        alert("Zbyt wiele błędnych prób. Wyślij nowy kod.")
        return
      }
      if (res.status === 401 || data.error === "invalid_code") {
        if (codeRef.current) codeRef.current.value = ""
        setAttemptsRemaining(data.attemptsRemaining ?? null)
        setCodeError(
          data.attemptsRemaining === 0
            ? "Nieprawidłowy kod. Brak pozostałych prób."
            : `Nieprawidłowy kod. Pozostałe próby: ${data.attemptsRemaining ?? ""}`
        )
        return
      }
      if (!res.ok) {
        alert("Błąd serwera. Spróbuj ponownie.")
        return
      }

      // Token verified — sign in to InstantDB session
      await db.auth.signInWithToken(data.token)
    } catch {
      alert("Błąd połączenia. Spróbuj ponownie.")
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div
      className="
        h-screen
        min-h-screen
        w-full
        items-center
        justify-center
        p-4
        overflow-hidden
        flex
        flex-col
        before:content-['']
        before:absolute
        before:inset-0
        before:bg-[url('/images/rose-bg.jpg')]
        before:bg-cover
        before:bg-center
        before:opacity-80
        before:z-[-1]"
    >
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.20)", backdropFilter: "blur(6px)" }}
      />

      <div
        className="relative z-10 w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(40px) saturate(200%)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.15), inset 0 2px 0 rgba(255,255,255,0.8)",
        }}
      >
        <div className="mb-5">
          <h2 className="text-slate-800 text-lg font-bold font-sans">
            Zaloguj się, aby umówić wizytę
          </h2>
        </div>

        {/* ── Access denied ── */}
        {step === "access_denied" && (
          <div className="flex flex-col gap-4">
            <div
              className="rounded-xl p-4 text-center"
              style={{
                background: "rgba(255,240,240,0.7)",
                border: "1px solid rgba(200,0,0,0.15)",
              }}
            >
              <p className="text-slate-800 font-bold text-sm font-sans mb-2">
                Brak dostępu
              </p>
              <p className="text-slate-600 text-xs font-sans leading-relaxed">
                Tylko autoryzowani pacjenci mogą rezerwować wizyty przez system online.
                Aby uzyskać dostęp, skontaktuj się z mną mailowo lub przez SMS.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep("email")
                setTimeout(() => emailRef.current?.focus(), 0)
              }}
              className="text-xs font-semibold font-sans text-slate-600 hover:text-slate-800 text-center"
            >
              Wróć
            </button>
          </div>
        )}

        {/* ── Email form ── */}
        {step === "email" && (
          <form onSubmit={handleSendCode} className="flex flex-col gap-4">
            <div>
              <label className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
                Email
              </label>
              <input
                ref={emailRef}
                type="email"
                required
                autoFocus
                placeholder="imie.nazwisko@gmail.com"
                className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 focus:border-slate-300 transition-colors"
                style={inputStyle}
              />
              <p className="mt-2 text-[11px] text-slate-800 font-sans">
                Wyślemy 6-cyfrowy kod na Twój adres e-mail.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSending || isLoadingUsers}
              className="w-full py-3 rounded-xl font-bold font-sans text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{
                backgroundColor: "#0C115B",
                color: "white",
                boxShadow: "0 8px 24px rgba(12,17,91,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                border: "1px solid rgba(12,17,91,0.6)",
              }}
            >
              {isSending ? "Wysyłanie…" : "Wyślij kod"}
            </button>

            <p className="text-[11px] text-slate-800 font-sans text-center leading-relaxed">
              Wpisując e-mail, zgadzasz się na przetwarzanie danych zgodnie z{" "}
              <Link
                href="/polityka-prywatnosci"
                className="underline hover:text-slate-700 transition-colors"
              >
                Polityką prywatności
              </Link>
              .
            </p>
          </form>
        )}

        {/* ── Code form ── */}
        {step === "code" && (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
            <div>
              <p className="text-slate-800 text-xs font-sans">
                Wysłaliśmy kod na{" "}
                <span className="font-semibold">{sentEmail}</span>.{" "}
                <span className="text-slate-800">Kod wygasa za 5 minut.</span>
              </p>
            </div>

            <div>
              <label className="block text-slate-800 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
                Kod 6-cyfrowy
              </label>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                maxLength={6}
                placeholder="123456"
                className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 focus:border-slate-300 transition-colors tracking-[0.3em] text-center"
                style={inputStyle}
                onChange={() => setCodeError("")}
              />
              {codeError && (
                <p className="mt-1.5 text-[11px] text-rose-600 font-sans font-semibold">
                  {codeError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isVerifying}
              className="w-full py-3 rounded-xl font-bold font-sans text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{
                backgroundColor: "#0C115B",
                color: "white",
                boxShadow: "0 8px 24px rgba(12,17,91,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                border: "1px solid rgba(12,17,91,0.6)",
              }}
            >
              {isVerifying ? "Weryfikacja…" : "Zaloguj się"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("email")
                setSentEmail("")
                setCodeError("")
                setAttemptsRemaining(null)
              }}
              className="text-xs font-semibold font-sans text-slate-600 hover:text-slate-800"
            >
              Użyj innego adresu e-mail
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
