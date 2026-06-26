/** Strip everything except digits from a phone input. */
export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "")
}

function isPolishDigits(digits: string): boolean {
  if (/^48[1-9]\d{8}$/.test(digits)) return true
  if (/^[1-9]\d{8}$/.test(digits)) return true
  return false
}

function isBelgianDigits(digits: string): boolean {
  if (/^32[1-9]\d{7,8}$/.test(digits)) return true
  if (/^0[1-9]\d{7,8}$/.test(digits)) return true
  return false
}

/** Validate Polish and Belgian phone numbers (+, spaces and dashes allowed). */
export function isValidPhoneNumber(value: string): boolean {
  const digits = normalizePhoneDigits(value)
  if (!digits) return false
  return isPolishDigits(digits) || isBelgianDigits(digits)
}

/** Store in E.164 (+48… or +32…). */
export function formatPhoneForStorage(value: string): string {
  const digits = normalizePhoneDigits(value)
  if (!digits) return value.trim()

  if (/^48[1-9]\d{8}$/.test(digits)) {
    return `+${digits}`
  }
  if (/^[1-9]\d{8}$/.test(digits)) {
    return `+48${digits}`
  }
  if (/^32[1-9]\d{7,8}$/.test(digits)) {
    return `+${digits}`
  }
  if (/^0[1-9]\d{7,8}$/.test(digits)) {
    return `+32${digits.slice(1)}`
  }

  const trimmed = value.trim()
  return trimmed.startsWith("+") ? trimmed.replace(/\s+/g, "") : `+${digits}`
}
