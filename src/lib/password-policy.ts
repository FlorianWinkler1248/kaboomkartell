/**
 * Password-Policy + Strength-Score (v2.5)
 *
 * Pure JS — KEIN Crypto-Import, damit auch in Client-Components nutzbar
 * (z.B. live Strength-Indicator auf Register/Reset-Page).
 *
 * Server-Side Generator + AES-Verschluesselung leben in `auth-security.ts`
 * (Node-only Crypto-Imports).
 */

export const PASSWORD_POLICY = {
  MIN_LENGTH: 12,
  REQUIRE_LOWERCASE: true,
  REQUIRE_UPPERCASE: true,
  REQUIRE_DIGIT: true,
  REQUIRE_SPECIAL: true,
} as const;

const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/~`"'\\]/;

/**
 * Validiert ein Passwort gegen die Policy. Leere Liste = OK.
 */
export function validatePasswordStrength(password: string): string[] {
  const errors: string[] = [];
  if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
    errors.push(`At least ${PASSWORD_POLICY.MIN_LENGTH} characters required.`);
  }
  if (PASSWORD_POLICY.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    errors.push('Add a lowercase letter.');
  }
  if (PASSWORD_POLICY.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    errors.push('Add an uppercase letter.');
  }
  if (PASSWORD_POLICY.REQUIRE_DIGIT && !/\d/.test(password)) {
    errors.push('Add a digit.');
  }
  if (PASSWORD_POLICY.REQUIRE_SPECIAL && !SPECIAL_CHAR_REGEX.test(password)) {
    errors.push('Add a special character (e.g. !@#$%).');
  }
  return errors;
}

/**
 * Strength-Score (0-4) für den Live-Indicator im UI.
 * 0 = leer, 1 = sehr schwach, 2 = schwach, 3 = OK (Policy erfuellt), 4 = stark.
 */
export function passwordStrengthScore(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  const errors = validatePasswordStrength(password);
  if (errors.length > 0) {
    if (password.length < 6) return 1;
    return 2;
  }
  if (
    password.length >= 16 &&
    /[a-z].*[a-z]/.test(password) &&
    /[A-Z].*[A-Z]/.test(password)
  ) {
    return 4;
  }
  return 3;
}

/**
 * Lese-freundliche Stufen-Labels für das UI.
 */
export const STRENGTH_LABELS: readonly string[] = [
  '',
  'Very weak',
  'Weak',
  'OK',
  'Strong',
];

export const STRENGTH_COLORS: readonly string[] = [
  'transparent',
  '#E63B2E', // rot
  '#E63B2E', // rot
  '#F5D02E', // gelb
  '#3FCF4A', // grün
];
