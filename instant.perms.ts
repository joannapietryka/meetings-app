import type { InstantRules } from "@instantdb/react"

const adminEmailList = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

const adminEmailRuleLiteral =
  adminEmailList.length === 0
    ? "[]"
    : `[${adminEmailList
        .map((e) => `'${e.replaceAll("'", "\\'")}'`)
        .join(", ")}]`

const rules = {
  meetings: {
    allow: {
      view: "auth.id != null && (isAdmin || isOwner)",
      create: "auth.id != null && (isAdmin || auth.id == data.userId)",
      update: "auth.id != null && (isAdmin || (isOwner && isStillOwner))",
      delete: "auth.id != null && (isAdmin || isOwner)",
    },
    bind: {
      isAdmin: `auth.email in ${adminEmailRuleLiteral}`,
      isOwner: "auth.id != null && auth.id == data.userId",
      isStillOwner: "auth.id != null && auth.id == newData.userId",
    },
  },
} satisfies InstantRules

export default rules

