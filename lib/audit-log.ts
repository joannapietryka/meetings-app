type AuditMeta = Record<string, string | number | boolean | null | undefined>

export function auditLog(event: string, meta: AuditMeta = {}): void {
  console.info(
    JSON.stringify({
      type: "audit",
      event,
      at: new Date().toISOString(),
      ...meta,
    }),
  )
}
