"use client"

import React, { useMemo, useRef, useState } from "react"
import { X } from "lucide-react"
import { db } from "@/lib/db"

export function LoginScreen() {
  const [sentEmail, setSentEmail] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

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

  return (
    <div
      className="h-screen max-h-screen w-full flex items-center justify-center p-4 overflow-hidden"
      style={{
        backgroundImage: "url('/images/bg-green-gradient.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
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
            Sign in with your email to schedule a meeting
          </h2>
        </div>

        {!sentEmail ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const email = emailRef.current?.value?.trim() ?? ""
              if (!email) return
              setIsSending(true)
              setSentEmail(email)
              db.auth
                .sendMagicCode({ email })
                .catch((err: any) => {
                  alert("Uh oh: " + (err?.body?.message ?? err?.message ?? "Unknown error"))
                  setSentEmail("")
                })
                .finally(() => setIsSending(false))
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
                Email
              </label>
              <input
                ref={emailRef}
                type="email"
                required
                autoFocus
                placeholder="you@company.com"
                className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 focus:border-slate-300 transition-colors"
                style={inputStyle}
              />
              <p className="mt-2 text-[11px] text-slate-500 font-sans">
                We’ll send a 6‑digit code to your email.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="w-full py-3 rounded-xl font-bold font-sans text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{
                backgroundColor: "#0C115B",
                color: "white",
                boxShadow: "0 8px 24px rgba(12,17,91,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                border: "1px solid rgba(12,17,91,0.6)",
              }}
            >
              {isSending ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const code = codeRef.current?.value?.trim() ?? ""
              if (!code) return
              setIsVerifying(true)
              db.auth
                .signInWithMagicCode({ email: sentEmail, code })
                .catch((err: any) => {
                  if (codeRef.current) codeRef.current.value = ""
                  alert("Uh oh: " + (err?.body?.message ?? err?.message ?? "Unknown error"))
                })
                .finally(() => setIsVerifying(false))
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <p className="text-slate-600 text-xs font-sans">
                We sent a code to <span className="font-semibold">{sentEmail}</span>.
              </p>
            </div>

            <div>
              <label className="block text-slate-500 text-xs font-semibold mb-1.5 font-sans uppercase tracking-wide">
                6-digit code
              </label>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                placeholder="123456"
                className="w-full rounded-xl px-3 py-2.5 text-sm font-sans placeholder:text-slate-400 focus:border-slate-300 transition-colors tracking-[0.3em] text-center"
                style={inputStyle}
              />
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
              {isVerifying ? "Verifying…" : "Verify & sign in"}
            </button>

            <button
              type="button"
              onClick={() => setSentEmail("")}
              className="text-xs font-semibold font-sans text-slate-600 hover:text-slate-800"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

