// Unit-Spec für die Auth-Security-Helpers (auth-security.ts, v2.4–v2.7).
// Deckt Account-Lockout, 2FA-Backup-Codes, TOTP-Secret-Verschlüsselung,
// Reset-/Verify-Token und Trust-Tier ab — alles reine Funktionen (bcrypt +
// node:crypto, keine DB). Lauf: `pnpm test`.
//
// ENCRYPTION_KEY wird hier auf einen Test-Schlüssel gesetzt (32 Bytes hex),
// damit encryptSecret/decryptSecret ohne echtes Secret laufen.

import { describe, it, expect, beforeAll } from 'vitest'
import {
  MAX_FAILED_LOGIN_ATTEMPTS,
  ACCOUNT_LOCKOUT_DURATION_MS,
  isAccountLocked,
  computeLockoutUntil,
  BACKUP_CODE_COUNT,
  generateBackupCodes,
  verifyBackupCode,
  encryptSecret,
  decryptSecret,
  generateResetToken,
  isResetTokenValid,
  generateStrongPassword,
  computeTrustTier,
  generateEmailOtp,
  isEmailOtpValid,
  validatePasswordStrength,
} from '../auth-security'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64) // 32 Bytes hex (Test-Schlüssel)
})

describe('Account-Lockout', () => {
  it('isAccountLocked: null/undefined → nicht gesperrt', () => {
    expect(isAccountLocked(null)).toBe(false)
    expect(isAccountLocked(undefined)).toBe(false)
  })

  it('isAccountLocked: Datum in der Zukunft → gesperrt, in der Vergangenheit → frei', () => {
    expect(isAccountLocked(new Date(Date.now() + 60_000))).toBe(true)
    expect(isAccountLocked(new Date(Date.now() - 60_000))).toBe(false)
  })

  it('computeLockoutUntil liegt rund ACCOUNT_LOCKOUT_DURATION_MS in der Zukunft', () => {
    const before = Date.now()
    const until = computeLockoutUntil().getTime()
    expect(until).toBeGreaterThanOrEqual(before + ACCOUNT_LOCKOUT_DURATION_MS - 50)
    expect(until).toBeLessThanOrEqual(Date.now() + ACCOUNT_LOCKOUT_DURATION_MS + 50)
  })

  it('die Policy-Konstanten haben sinnvolle Werte', () => {
    expect(MAX_FAILED_LOGIN_ATTEMPTS).toBeGreaterThan(0)
    expect(ACCOUNT_LOCKOUT_DURATION_MS).toBe(15 * 60_000)
  })
})

describe('2FA-Backup-Codes', () => {
  it('generiert BACKUP_CODE_COUNT Codes im Format XXXXX-XXXXX', async () => {
    const { plain, hashed } = await generateBackupCodes()
    expect(plain).toHaveLength(BACKUP_CODE_COUNT)
    expect(hashed).toHaveLength(BACKUP_CODE_COUNT)
    for (const code of plain) {
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/) // keine 0/O/1/I/L
    }
    // Hashes ≠ Klartext (bcrypt).
    expect(hashed[0]).not.toBe(plain[0])
  })

  it('verifyBackupCode findet den passenden Code am korrekten Index', async () => {
    const { plain, hashed } = await generateBackupCodes()
    expect(await verifyBackupCode(plain[3], hashed)).toBe(3)
  })

  it('verifyBackupCode normalisiert (trim + uppercase)', async () => {
    const { plain, hashed } = await generateBackupCodes()
    expect(await verifyBackupCode(`  ${plain[1].toLowerCase()}  `, hashed)).toBe(1)
  })

  it('verifyBackupCode liefert -1, wenn kein Code matched', async () => {
    const { hashed } = await generateBackupCodes()
    expect(await verifyBackupCode('ZZZZZ-ZZZZZ', hashed)).toBe(-1)
  })
})

describe('TOTP-Secret-Verschlüsselung (AES-256-GCM)', () => {
  it('Roundtrip: decrypt(encrypt(x)) === x', () => {
    const secret = 'JBSWY3DPEHPK3PXP'
    expect(decryptSecret(encryptSecret(secret))).toBe(secret)
  })

  it('erzeugt pro Aufruf unterschiedliche Ciphertexts (zufälliger IV)', () => {
    const secret = 'JBSWY3DPEHPK3PXP'
    expect(encryptSecret(secret)).not.toBe(encryptSecret(secret))
  })

  it('wirft bei manipuliertem Ciphertext (Auth-Tag-Prüfung)', () => {
    const enc = encryptSecret('JBSWY3DPEHPK3PXP')
    const tampered = enc.slice(0, -2) + (enc.endsWith('00') ? '11' : '00')
    expect(() => decryptSecret(tampered)).toThrow()
  })
})

describe('Reset-Token', () => {
  it('generiert einen URL-safe Token mit Zukunfts-Ablauf', () => {
    const { token, expiry } = generateResetToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThanOrEqual(40)
    expect(expiry.getTime()).toBeGreaterThan(Date.now())
  })

  it('isResetTokenValid: Zukunft true, Vergangenheit/null false', () => {
    expect(isResetTokenValid(new Date(Date.now() + 60_000))).toBe(true)
    expect(isResetTokenValid(new Date(Date.now() - 60_000))).toBe(false)
    expect(isResetTokenValid(null)).toBe(false)
  })
})

describe('generateStrongPassword', () => {
  it('erfüllt immer die Policy und hält die gewünschte Länge', () => {
    for (let i = 0; i < 20; i++) {
      const pw = generateStrongPassword(16)
      expect(pw).toHaveLength(16)
      expect(validatePasswordStrength(pw)).toEqual([])
    }
  })

  it('hebt zu kurze Längen auf das Policy-Minimum an', () => {
    expect(generateStrongPassword(4).length).toBeGreaterThanOrEqual(12)
  })
})

describe('computeTrustTier', () => {
  it('T0 ohne Email-Verifikation', () => {
    expect(computeTrustTier({ emailVerified: null, twoFactorEnabled: false })).toBe('T0')
    expect(computeTrustTier({ emailVerified: null, twoFactorEnabled: true })).toBe('T0')
  })

  it('T1 mit Email, ohne 2FA', () => {
    expect(computeTrustTier({ emailVerified: new Date(), twoFactorEnabled: false })).toBe('T1')
  })

  it('T2 mit Email + 2FA', () => {
    expect(computeTrustTier({ emailVerified: new Date(), twoFactorEnabled: true })).toBe('T2')
  })
})

describe('Email-OTP', () => {
  it('generiert einen 6-stelligen numerischen Code (führende Nullen erlaubt)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateEmailOtp()).toMatch(/^\d{6}$/)
    }
  })

  it('isEmailOtpValid: Zukunft true, Vergangenheit/null false', () => {
    expect(isEmailOtpValid(new Date(Date.now() + 60_000))).toBe(true)
    expect(isEmailOtpValid(new Date(Date.now() - 60_000))).toBe(false)
    expect(isEmailOtpValid(null)).toBe(false)
  })
})
