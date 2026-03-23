import { createHmac } from 'crypto'

/**
 * Compute a fast, server-secret-keyed HMAC of the PIN.
 * Used as a lookup index so we can find the patient record with a single DB query
 * instead of iterating + bcrypt-comparing all 120 patients.
 *
 * NEXTAUTH_SECRET must be set — it acts as the HMAC key, making this non-rainbow-table-able.
 */
export function pinIndexHash(pin: string): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set')
  return createHmac('sha256', secret).update(pin).digest('hex')
}

const WEAK_PINS = new Set([
  // All same digit
  '000000', '111111', '222222', '333333', '444444',
  '555555', '666666', '777777', '888888', '999999',
  // Sequential ascending / descending
  '123456', '234567', '345678', '456789', '567890',
  '654321', '765432', '876543', '987654', '098765',
])

export function validatePin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return false
  if (WEAK_PINS.has(pin)) return false
  return true
}

export function pinError(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'PIN must be exactly 6 digits'
  if (WEAK_PINS.has(pin)) return 'PIN is too easy to guess. Please choose a different PIN.'
  return null
}
