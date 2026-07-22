import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "600", "700"],
})

export const metadata: Metadata = {
  title: "Planer wizyt  - psycholog Katarzyna Pietryka",
  description: "Planer wizyt dostępnny dla pacjentów psycholog Katarzyna Pietryka",
  generator: "v0.app",
  icons: {
    icon: "/favicon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pl" className={`${inter.variable} antialiased`}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
