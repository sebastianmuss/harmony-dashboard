/**
 * Password policy for provider / admin accounts.
 *
 * Requirements (BSI TR-02102 / GDPR accountability baseline):
 *   - At least 12 characters
 *   - At least 1 uppercase letter  [A-Z]
 *   - At least 1 lowercase letter  [a-z]
 *   - At least 1 digit             [0-9]
 *   - At least 1 special character [!@#$%^&*()_+\-=[\]{}|;':",.<>/?`~]
 */

export interface PasswordCheck {
  minLength:   boolean
  hasUpper:    boolean
  hasLower:    boolean
  hasDigit:    boolean
  hasSpecial:  boolean
}

export function checkPassword(pw: string): PasswordCheck {
  return {
    minLength:  pw.length >= 12,
    hasUpper:   /[A-Z]/.test(pw),
    hasLower:   /[a-z]/.test(pw),
    hasDigit:   /[0-9]/.test(pw),
    hasSpecial: /[!@#$%^&*()\-_=+[\]{}|;':",.<>/?`~\\]/.test(pw),
  }
}

export function isPasswordValid(pw: string): boolean {
  const c = checkPassword(pw)
  return c.minLength && c.hasUpper && c.hasLower && c.hasDigit && c.hasSpecial
}

export const PASSWORD_RULES_DE = [
  { key: 'minLength'  as const, label: 'Mindestens 12 Zeichen' },
  { key: 'hasUpper'   as const, label: 'Mindestens 1 Großbuchstabe' },
  { key: 'hasLower'   as const, label: 'Mindestens 1 Kleinbuchstabe' },
  { key: 'hasDigit'   as const, label: 'Mindestens 1 Ziffer' },
  { key: 'hasSpecial' as const, label: 'Mindestens 1 Sonderzeichen' },
]

export const PASSWORD_RULES_EN = [
  { key: 'minLength'  as const, label: 'At least 12 characters' },
  { key: 'hasUpper'   as const, label: 'At least 1 uppercase letter' },
  { key: 'hasLower'   as const, label: 'At least 1 lowercase letter' },
  { key: 'hasDigit'   as const, label: 'At least 1 digit' },
  { key: 'hasSpecial' as const, label: 'At least 1 special character' },
]
