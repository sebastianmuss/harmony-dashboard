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

export function validatePin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}
