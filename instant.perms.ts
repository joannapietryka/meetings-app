import type { InstantRules } from "@instantdb/react"

/** Inline allowlist for Instant CLI (no path aliases). Keep in sync with lib/admin-emails.ts. */
function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? ""
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

const adminEmailList = getAdminEmails()

const adminEmailRuleLiteral =
  adminEmailList.length === 0
    ? "[]"
    : `[${adminEmailList
        .map((e) => `'${e.replaceAll("'", "\\'")}'`)
        .join(", ")}]`

const adminBind = {
  isAdmin: `auth.email in ${adminEmailRuleLiteral}`,
}

const rules = {
  otpSessions: {
    allow: {
      view: "false",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  allowedUsers: {
    allow: {
      view: "auth.id != null && isAdmin",
      create: "auth.id != null && isAdmin",
      update: "auth.id != null && isAdmin",
      delete: "auth.id != null && isAdmin",
    },
    bind: adminBind,
  },
  scheduleSlots: {
    allow: {
      view: "auth.id != null",
      create: "auth.id != null && isAdmin",
      update: "auth.id != null && isAdmin",
      delete: "auth.id != null && isAdmin",
    },
    bind: adminBind,
  },
  bookingSettings: {
    allow: {
      view: "auth.id != null",
      create: "auth.id != null && isAdmin",
      update: "auth.id != null && isAdmin",
      delete: "auth.id != null && isAdmin",
    },
    bind: adminBind,
  },
  blockedDates: {
    allow: {
      view: "auth.id != null",
      create: "auth.id != null && isAdmin",
      update: "auth.id != null && isAdmin",
      delete: "auth.id != null && isAdmin",
    },
    bind: adminBind,
  },
  blockedSlots: {
    allow: {
      view: "auth.id != null",
      create: "auth.id != null && isAdmin",
      update: "auth.id != null && isAdmin",
      delete: "auth.id != null && isAdmin",
    },
    bind: adminBind,
  },
  meetings: {
    allow: {
      view: "auth.id != null && (isAdmin || isOwner)",
      create: "auth.id != null && (isAdmin || auth.id == data.userId)",
      update: "auth.id != null && (isAdmin || (isOwner && isStillOwner))",
      delete: "auth.id != null && (isAdmin || isOwner)",
    },
    bind: {
      ...adminBind,
      // Admin-created visits often have userEmail but no userId yet — allow ownership by either.
      isOwner:
        "auth.id != null && (auth.id == data.userId || (data.userEmail != null && auth.email == data.userEmail))",
      isStillOwner:
        "auth.id != null && (auth.id == newData.userId || (newData.userEmail != null && auth.email == newData.userEmail))",
    },
  },
} satisfies InstantRules

export default rules
