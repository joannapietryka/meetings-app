import { id } from "@instantdb/react"
import type { User } from "@instantdb/core"
import { instantAdminQuery, instantAdminTransact } from "@/lib/instant-admin"
import {
  validateGuestBookingLimits,
  validateGuestSlot,
  type BookingMeetingRef,
} from "@/lib/booking-rules"
import type { GuestMeetingBody } from "@/lib/schemas/meetings"
import type { InCabinetDayRecord } from "@/lib/in-cabinet-days"
import type { ScheduleSlotRecord } from "@/lib/schedule-slots"
import { formatPhoneForStorage, isValidPhoneNumber } from "@/lib/phone"
import { SESSION_DURATION } from "@/lib/calendar-types"
import { forwardMeetingWebhook } from "@/lib/n8n-meetings-webhook"

type DbMeeting = BookingMeetingRef & {
  userId?: string
  userEmail?: string
  title?: string
  description?: string
  category?: string
  duration?: number
  userPhone?: string
}

type BookingContext = {
  scheduleSlotRecords: ScheduleSlotRecord[]
  inCabinetDayRecords: InCabinetDayRecord[]
  blockedDates: Set<string>
  blockedSlots: Map<string, Set<string>>
  allMeetings: Array<{ id: string; date: string; time?: string }>
  userMeetings: BookingMeetingRef[]
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase()
}

function isMeetingOwnedByUser(
  meeting: Pick<DbMeeting, "userId" | "userEmail">,
  user: Pick<User, "id" | "email">,
): boolean {
  if (meeting.userId && meeting.userId === user.id) return true
  const meetingEmail = normalizeEmail(meeting.userEmail)
  const userEmail = normalizeEmail(user.email)
  return Boolean(meetingEmail && userEmail && meetingEmail === userEmail)
}

async function loadBookingContext(user: Pick<User, "id" | "email">): Promise<BookingContext> {
  const result = await instantAdminQuery<{
    meetings: DbMeeting[]
    blockedDates: { date: string }[]
    blockedSlots: { date: string; time: string }[]
    scheduleSlots: ScheduleSlotRecord[]
    bookingSettings: InCabinetDayRecord[]
  }>({
    query: {
      meetings: {},
      blockedDates: {},
      blockedSlots: {},
      scheduleSlots: {},
      bookingSettings: {},
    },
  })

  const blockedDates = new Set((result.blockedDates ?? []).map((b) => b.date))
  const blockedSlots = new Map<string, Set<string>>()
  for (const slot of result.blockedSlots ?? []) {
    if (!blockedSlots.has(slot.date)) blockedSlots.set(slot.date, new Set())
    blockedSlots.get(slot.date)!.add(slot.time)
  }

  const userMeetings = (result.meetings ?? []).filter((m) => isMeetingOwnedByUser(m, user))

  return {
    scheduleSlotRecords: result.scheduleSlots ?? [],
    inCabinetDayRecords: result.bookingSettings ?? [],
    blockedDates,
    blockedSlots,
    allMeetings: (result.meetings ?? []).filter((m) => m.date && m.time) as Array<{
      id: string
      date: string
      time?: string
    }>,
    userMeetings,
  }
}

function ensureValidPhone(phone: string) {
  if (!isValidPhoneNumber(phone)) {
    return {
      ok: false as const,
      code: "invalid_phone",
      message: "Podaj prawidłowy numer telefonu (PL lub BE).",
    }
  }
  return { ok: true as const, phone: formatPhoneForStorage(phone) }
}

export async function createGuestMeeting(user: User, body: GuestMeetingBody) {
  const phoneCheck = ensureValidPhone(body.phone)
  if (!phoneCheck.ok) {
    return { ok: false as const, code: phoneCheck.code, message: phoneCheck.message, status: 409 }
  }

  const ctx = await loadBookingContext(user)
  const limits = validateGuestBookingLimits({
    targetDate: body.date,
    existingMeetings: ctx.userMeetings,
  })
  if (!limits.ok) {
    return { ok: false as const, code: limits.code, message: limits.message, status: 409 }
  }

  const slot = validateGuestSlot({
    date: body.date,
    time: body.time,
    category: body.category,
    scheduleSlotRecords: ctx.scheduleSlotRecords,
    inCabinetDayRecords: ctx.inCabinetDayRecords,
    blockedDates: ctx.blockedDates,
    blockedSlots: ctx.blockedSlots,
    takenMeetings: ctx.allMeetings,
  })
  if (!slot.ok) {
    return { ok: false as const, code: slot.code, message: slot.message, status: 409 }
  }

  const meetingId = id()
  const createdAt = new Date().toISOString()
  const duration = body.duration ?? SESSION_DURATION

  await instantAdminTransact({
    steps: [
      [
        "update",
        "meetings",
        meetingId,
        {
          title: body.title,
          description: body.description ?? "",
          category: body.category,
          date: body.date,
          time: body.time,
          duration,
          userPhone: phoneCheck.phone,
          createdAt,
          userId: user.id,
          userEmail: user.email ?? "",
          createdBy: "guest",
          lastEditedBy: "guest",
          status: "confirmed",
        },
      ],
    ],
  })

  const webhook = await forwardMeetingWebhook({
    event: "meeting.created",
    meetingId,
    title: body.title,
    description: body.description,
    category: body.category,
    date: body.date,
    time: body.time,
    duration,
    userPhone: phoneCheck.phone,
    userId: user.id,
    userEmail: user.email ?? null,
    createdAt,
    lastEditedBy: "guest",
  })
  if (!webhook.ok) {
    console.error("[guest meeting.created webhook]", webhook.error, webhook.status)
  }

  return {
    ok: true as const,
    meetingId,
    createdAt,
    duration,
    userPhone: phoneCheck.phone,
    webhookOk: webhook.ok,
  }
}

export async function updateGuestMeeting(
  user: User,
  meetingId: string,
  body: GuestMeetingBody,
) {
  const phoneCheck = ensureValidPhone(body.phone)
  if (!phoneCheck.ok) {
    return { ok: false as const, code: phoneCheck.code, message: phoneCheck.message, status: 409 }
  }

  const existingResult = await instantAdminQuery<{ meetings: DbMeeting[] }>({
    query: { meetings: {} },
  })
  const existing = (existingResult.meetings ?? []).find((m) => m.id === meetingId)
  if (!existing || !isMeetingOwnedByUser(existing, user)) {
    return {
      ok: false as const,
      code: "not_found",
      message: "Nie znaleziono wizyty.",
      status: 404,
    }
  }

  const ctx = await loadBookingContext(user)
  const limits = validateGuestBookingLimits({
    targetDate: body.date,
    existingMeetings: ctx.userMeetings,
    excludeMeetingId: meetingId,
    previousDate: existing.date,
  })
  if (!limits.ok) {
    return { ok: false as const, code: limits.code, message: limits.message, status: 409 }
  }

  const slot = validateGuestSlot({
    date: body.date,
    time: body.time,
    category: body.category,
    scheduleSlotRecords: ctx.scheduleSlotRecords,
    inCabinetDayRecords: ctx.inCabinetDayRecords,
    blockedDates: ctx.blockedDates,
    blockedSlots: ctx.blockedSlots,
    takenMeetings: ctx.allMeetings,
    excludeMeetingId: meetingId,
  })
  if (!slot.ok) {
    return { ok: false as const, code: slot.code, message: slot.message, status: 409 }
  }

  const nowIso = new Date().toISOString()
  const duration = body.duration ?? SESSION_DURATION
  const ownerEmail = normalizeEmail(user.email) || normalizeEmail(existing.userEmail) || null

  await instantAdminTransact({
    steps: [
      [
        "update",
        "meetings",
        meetingId,
        {
          title: body.title,
          description: body.description ?? "",
          category: body.category,
          date: body.date,
          time: body.time,
          duration,
          userPhone: phoneCheck.phone,
          // Backfill ownership for admin-created visits that only had userEmail.
          userId: user.id,
          userEmail: ownerEmail,
          status: "confirmed",
          previousDate: null,
          previousTime: null,
          previousDuration: null,
          changeRequestedAt: null,
          lastEditedBy: "guest",
          updatedAt: nowIso,
        },
      ],
    ],
  })

  const webhook = await forwardMeetingWebhook({
    event: "meeting.edited",
    editedBy: "user",
    meetingId,
    title: body.title,
    description: body.description,
    category: body.category,
    date: body.date,
    time: body.time,
    duration,
    userPhone: phoneCheck.phone,
    userEmail: ownerEmail,
    status: "confirmed",
    previousDate: null,
    previousTime: null,
    previousDuration: null,
    changeRequestedAt: null,
    updatedAt: nowIso,
  })
  if (!webhook.ok) {
    console.error("[guest meeting.edited webhook]", webhook.error, webhook.status)
  }

  return {
    ok: true as const,
    updatedAt: nowIso,
    duration,
    userPhone: phoneCheck.phone,
    webhookOk: webhook.ok,
  }
}
