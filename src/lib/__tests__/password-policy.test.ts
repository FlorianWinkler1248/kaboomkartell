// Unit-Spec für die Passwort-Policy + Strength-Score (password-policy.ts, v2.5).
// Reine JS-Funktionen (kein Crypto/DB) → direkt testbar. Lauf: `pnpm test`.
// Deckt das im README beworbene Password-Hardening ab (Senior-Review 19.06.).

import { describe, it, expect } from 'vitest'
import {
  PASSWORD_POLICY,
  validatePasswordStrength,
  passwordStrengthScore,
  STRENGTH_LABELS,
} from '../password-policy'

describe('validatePasswordStrength', () => {
  it('akzeptiert ein Passwort, das alle Policy-Regeln erfüllt', () => {
    expect(validatePasswordStrength('Abcdef1!ghij')).toEqual([])
  })

  it('meldet zu kurze Passwörter (< MIN_LENGTH)', () => {
    const errors = validatePasswordStrength('Ab1!cd')
    expect(errors.some((e) => e.includes(String(PASSWORD_POLICY.MIN_LENGTH)))).toBe(true)
  })

  it('verlangt Klein-, Groß-, Ziffer- und Sonderzeichen einzeln', () => {
    // 12 Zeichen, aber nur Großbuchstaben → 3 fehlende Klassen.
    const errors = validatePasswordStrength('ABCDEFGHIJKL')
    expect(errors).toHaveLength(3) // lowercase, digit, special
    expect(validatePasswordStrength('abcdefghijkl')).toContain('Add an uppercase letter.')
    expect(validatePasswordStrength('Abcdefghijkl')).toContain('Add a digit.')
    expect(validatePasswordStrength('Abcdefghijk1')).toContain(
      'Add a special character (e.g. !@#$%).'
    )
  })

  it('akzeptiert diverse Sonderzeichen aus der erlaubten Klasse', () => {
    for (const special of ['!', '@', '#', '$', '%', '^', '&', '*', '-', '_', '=', '+']) {
      expect(validatePasswordStrength(`Abcdefghij1${special}`)).toEqual([])
    }
  })
})

describe('passwordStrengthScore', () => {
  it('0 für leeres Passwort', () => {
    expect(passwordStrengthScore('')).toBe(0)
  })

  it('1 für sehr kurze, ungültige Eingaben (< 6 Zeichen)', () => {
    expect(passwordStrengthScore('Ab1')).toBe(1)
  })

  it('2 für längere, aber policy-verletzende Passwörter', () => {
    expect(passwordStrengthScore('abcdefghijkl')).toBe(2) // nur lowercase
  })

  it('3 wenn die Policy erfüllt ist (aber nicht „stark")', () => {
    expect(passwordStrengthScore('Abcdef1!ghij')).toBe(3) // 12 Zeichen, valide
  })

  it('4 für lange Passwörter mit doppelter Buchstaben-Vielfalt', () => {
    expect(passwordStrengthScore('AbCdEf1!ghijklmnop')).toBe(4) // >=16, >=2 lower & upper
  })

  it('liefert für jeden Score ein passendes Label', () => {
    expect(STRENGTH_LABELS).toHaveLength(5)
    expect(STRENGTH_LABELS[passwordStrengthScore('AbCdEf1!ghijklmnop')]).toBe('Strong')
  })
})
