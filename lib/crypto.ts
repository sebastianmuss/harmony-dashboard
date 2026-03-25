/**
 * AES-256-GCM field-level encryption for sensitive patient data.
 * Key is read from FIELD_ENCRYPTION_KEY env var (32-byte hex string).
 * Each value gets a unique random IV — identical plaintexts produce different ciphertexts.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES   = 12  // 96-bit IV recommended for GCM
const TAG_BYTES  = 16

function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('FIELD_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypts a plaintext string.
 * Returns a base64 string of the format: iv(12) + ciphertext + authTag(16)
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv  = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, encrypted, tag]).toString('base64')
}

/**
 * Decrypts a base64 string produced by encrypt().
 * Returns null if decryption fails (wrong key, corrupted data).
 */
export function decrypt(ciphertext: string): string | null {
  try {
    const key = getKey()
    const buf  = Buffer.from(ciphertext, 'base64')
    const iv   = buf.subarray(0, IV_BYTES)
    const tag  = buf.subarray(buf.length - TAG_BYTES)
    const data = buf.subarray(IV_BYTES, buf.length - TAG_BYTES)
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(data) + decipher.final('utf8')
  } catch {
    return null
  }
}
