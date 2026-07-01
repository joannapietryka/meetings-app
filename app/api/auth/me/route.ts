import { NextResponse } from "next/server"
import { getSessionInfo, requireRequestUser, AuthError } from "@/lib/instant-auth"
import { publicServerErrorMessage } from "@/lib/api-errors"

export async function GET(req: Request) {
  try {
    const user = await requireRequestUser(req)
    const session = await getSessionInfo(user)
    return NextResponse.json(session)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: err.status })
    }
    console.error("[auth/me]", err)
    return NextResponse.json(
      { error: "server_error", message: publicServerErrorMessage(err) },
      { status: 500 },
    )
  }
}
