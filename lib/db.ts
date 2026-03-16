"use client"

import { init } from "@instantdb/react"

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  useDateObjects: true,
})