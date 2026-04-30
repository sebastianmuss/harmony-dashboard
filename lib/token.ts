/**
 * One-time password reset token utilities.
 * Tokens are 8 uppercase hex characters (e.g. "A3FC-8D2B"), valid for 4 hours.
 * Only the SHA-256 hash is stored in the database.
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto'

const TOKEN_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

/** Generate a fresh token. Returns the plaintext code (shown once) and its hash (stored). */
export function generateResetToken(): { code: string; hash: string; expiry: Date } {
  const raw  = randomBytes(4).toString('hex').toUpperCase()  // e.g. "A3FC8D2B"
  const code = raw.slice(0, 4) + '-' + raw.slice(4)          // e.g. "A3FC-8D2B"
  const hash = createHash('sha256').update(raw).digest('hex')
  const expiry = new Date(Date.now() + TOKEN_TTL_MS)
  return { code, hash, expiry }
}

/** Verify a code submitted by the user against the stored hash. Returns false if expired. */
export function verifyResetToken(code: string, storedHash: string, expiry: Date): boolean {
  if (new Date() > expiry) return false
  const raw  = code.replace('-', '').toUpperCase()
  const hash = createHash('sha256').update(raw).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash))
  } catch {
    return false
  }
}
