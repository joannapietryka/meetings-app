export function publicServerErrorMessage(err: unknown): string {
  if (process.env.NODE_ENV === "production") {
    return "Internal server error"
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message
  }
  return "Unknown error"
}
