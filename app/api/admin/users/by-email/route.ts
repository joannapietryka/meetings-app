import { NextResponse } from "next/server"
import { ZodError, z } from "zod"
import {
  AuthError,
  getSessionInfo,
  requireRequestUser,
  resolveUserIdByEmail,
} from "@/lib/instant-auth"
import {
  forbiddenResponse,
  rateLimitResponse,
  serverErrorResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "@/lib/api-response"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

const querySchema = z.object({
  email: z.string().trim().email().max(254),
})

export async function GET(req: Request) {
  const rate = enforceRateLimit(req, "admin:users-by-email", RATE_LIMITS.meetingsWrite)
  if (!rate.allowed) return rateLimitResponse(rate)

  try {
    const user = await requireRequestUser(req)
    const session = await getSessionInfo(user)
    if (!session.isAdmin) {
      return forbiddenResponse()
    }

    const { searchParams } = new URL(req.url)
    const { email } = querySchema.parse({ email: searchParams.get("email") })
    const userId = await resolveUserIdByEmail(email)

    return NextResponse.json({
      email: email.trim().toLowerCase(),
      userId,
    })
  } catch (err) {
    if (err instanceof AuthError) return unauthorizedResponse()
    if (err instanceof ZodError) return validationErrorResponse(err)
    return serverErrorResponse("admin/users/by-email", err)
  }
}
