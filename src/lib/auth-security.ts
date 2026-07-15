/**
 * Auth-Security-Helpers (Block A, B, C, D — v2.4 Account-Security)
 *
 * Zentrale Sammelstelle für:
 * - Login-Rate-Limiting (IP + Email)
 * - Account-Lockout-Logik
 * - Token-Versionierung (Logout-all-Devices)
 * - 2FA-Helpers (TOTP + Backup-Codes)
 * - Password-Reset-Token-Generierung
 *
 * Best-Practice: Konstanten zentral, Logik einmal — alle Auth-Pfade teilen
 * dieselbe Sicherheits-Policy.
 */

import { rateLimit } from '@/lib/rate-limit';
import bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'crypto';

// === Block A: Login-Hardening ===

/** Maximale Login-Fehlversuche bevor der Account temporaer gesperrt wird. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** Dauer der Account-Sperre nach Erreichen des Limits (15 Minuten). */
export const ACCOUNT_LOCKOUT_DURATION_MS = 15 * 60_000;

/**
 * Login-Versuche pro IP — 10/Minute. Erste Verteidigung gegen
 * Distributed-Brute-Force (gleicher Bot, viele Accounts).
 */
export const loginRateLimit = rateLimit({ interval: 60_000, maxKeys: 1000 });

/** Hilfsfunktion: ist der Account aktuell gesperrt? */
export function isAccountLocked(lockedUntil: Date | null | undefined): boolean {
  if (!lockedUntil) return false;
  return lockedUntil.getTime() > Date.now();
}

/** Berechnet das neue lockedUntil-Datum (jetzt + Lockout-Dauer). */
export function computeLockoutUntil(): Date {
  return new Date(Date.now() + ACCOUNT_LOCKOUT_DURATION_MS);
}

// === Block C: 2FA-Helpers ===

/** Anzahl Backup-Codes die bei 2FA-Setup generiert werden. */
export const BACKUP_CODE_COUNT = 8;

/**
 * Generiert einen 10-stelligen Backup-Code im Format XXXXX-XXXXX.
 * Ausschließlich Grossbuchstaben + Ziffern (keine 0/O, 1/I/L Verwechslungen).
 */
function generateBackupCode(): string {
  // CSPRNG-Pflicht: Backup-Codes sind ein vollwertiger 2FA-Bypass —
  // Math.random() (V8-PRNG) ist bei öffentlichem Algorithmus vorhersagbar.
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const pickChar = () => alphabet[randomInt(alphabet.length)];
  const half = () => Array.from({ length: 5 }, pickChar).join('');
  return `${half()}-${half()}`;
}

/**
 * Generiert N Backup-Codes (Klartext) und gibt sowohl Klartext als auch
 * gehashte Version zurück. Klartext wird einmalig dem User gezeigt,
 * gehashte Version wird in der DB gespeichert.
 */
export async function generateBackupCodes(): Promise<{
  plain: string[];
  hashed: string[];
}> {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = generateBackupCode();
    plain.push(code);
    hashed.push(await bcrypt.hash(code, 10));
  }
  return { plain, hashed };
}

/**
 * Prüft ob ein eingegebener Backup-Code gegen einen der gespeicherten
 * Hashes matched. Rueckgabe: Index des gematchten Codes (zum Entfernen)
 * oder -1 wenn keiner matched.
 */
export async function verifyBackupCode(
  inputCode: string,
  storedHashes: string[]
): Promise<number> {
  const normalized = inputCode.trim().toUpperCase();
  for (let i = 0; i < storedHashes.length; i++) {
    if (await bcrypt.compare(normalized, storedHashes[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * AES-GCM-basierte Verschluesselung für das 2FA-TOTP-Secret.
 * Schlüssel kommt aus ENCRYPTION_KEY (32 Bytes hex). Ohne diesen
 * Schlüssel kann das Secret aus DB-Backups nicht reproduziert werden.
 */
import { createCipheriv, createDecipheriv } from 'crypto';

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY env var fehlt — siehe .env.example');
  }
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY muss 32 Bytes hex sein (64 Zeichen)');
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !encHex) {
    throw new Error('Ungueltiges Ciphertext-Format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

// === Block D: Password-Reset-Token ===

/** Reset-Token-Lifetime (1 Stunde). */
export const RESET_TOKEN_LIFETIME_MS = 60 * 60_000;

/**
 * Generiert einen kryptographisch sicheren Reset-Token (URL-safe).
 * 32 Bytes -> 43 base64url-Zeichen, kollisionsfrei in der Praxis.
 */
export function generateResetToken(): { token: string; expiry: Date } {
  const token = randomBytes(32).toString('base64url');
  const expiry = new Date(Date.now() + RESET_TOKEN_LIFETIME_MS);
  return { token, expiry };
}

/** Prüft ob ein Reset-Token noch gültig ist (nicht abgelaufen). */
export function isResetTokenValid(expiry: Date | null | undefined): boolean {
  if (!expiry) return false;
  return expiry.getTime() > Date.now();
}

// === Block E (v2.5): Passwort-Policy + Generator ===

// Re-Export der Pure-JS-Policy-Funktionen (auch für Client-Components nutzbar):
export {
  PASSWORD_POLICY,
  validatePasswordStrength,
  passwordStrengthScore,
  STRENGTH_LABELS,
  STRENGTH_COLORS,
} from '@/lib/password-policy';
import { PASSWORD_POLICY } from '@/lib/password-policy';

/**
 * Generiert ein kryptographisch sicheres Passwort, das die Policy erfuellt.
 * Default 16 Zeichen — länger als das Minimum von 12, aber gut merkbar/copybar.
 *
 * Server-only (nutzt node:crypto.randomBytes). Für Client-Generator gibt
 * es den Endpoint /api/auth/suggest-password.
 */
export function generateStrongPassword(length = 16): string {
  if (length < PASSWORD_POLICY.MIN_LENGTH) length = PASSWORD_POLICY.MIN_LENGTH;
  const lower = 'abcdefghijkmnopqrstuvwxyz';   // ohne 'l' (Verwechslung)
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';    // ohne 'I', 'O' (Verwechslung)
  const digit = '23456789';                     // ohne 0, 1
  const special = '!@#$%^&*-_=+';
  const all = lower + upper + digit + special;

  const pickFrom = (set: string): string => {
    const buf = randomBytes(1);
    return set[buf[0] % set.length];
  };

  const guaranteed = [
    pickFrom(lower),
    pickFrom(upper),
    pickFrom(digit),
    pickFrom(special),
  ];
  const rest: string[] = [];
  for (let i = 0; i < length - 4; i++) {
    rest.push(pickFrom(all));
  }
  const chars = [...guaranteed, ...rest];

  // Fisher-Yates Shuffle (kryptographisch via randomBytes)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// === Trust-Tier (v2.7 — Email-Verification aktiviert T0) ===

export type TrustTier = 'T0' | 'T1' | 'T2';

/**
 * Berechnet den Trust-Tier eines Users basierend auf den Account-Flags.
 *
 * T0 = Email noch nicht verifiziert. Read-Only — kein Voten, kein Posten,
 *      kein Wolfpack-Aufstieg möglich.
 * T1 = Email verifiziert, kein 2FA. Lesen + Voten + Track-Requests.
 * T2 = Email verifiziert + 2FA aktiv. Volle Community-Rechte, eligible
 *      für Role-Upgrade durch Admin.
 *
 * Wolfpack-Interaktion (Posts, Comments, Reposts in zukuenftigen Features)
 * setzt T2 voraus.
 */
export function computeTrustTier(user: {
  emailVerified: Date | null;
  twoFactorEnabled: boolean;
}): TrustTier {
  if (!user.emailVerified) return 'T0';
  if (user.twoFactorEnabled) return 'T2';
  return 'T1';
}

// === Email-Verification (Block O, v2.7) ===

/** Lifetime für Email-Verification-Tokens (24 Stunden). */
export const EMAIL_VERIFY_TOKEN_LIFETIME_MS = 24 * 60 * 60_000;

/**
 * Generiert einen kryptographisch sicheren Email-Verification-Token.
 * 32 Bytes -> 43 base64url-Zeichen.
 */
export function generateEmailVerifyToken(): { token: string; expiry: Date } {
  const token = randomBytes(32).toString('base64url');
  const expiry = new Date(Date.now() + EMAIL_VERIFY_TOKEN_LIFETIME_MS);
  return { token, expiry };
}

export function isEmailVerifyTokenValid(expiry: Date | null | undefined): boolean {
  if (!expiry) return false;
  return expiry.getTime() > Date.now();
}

// === Email-2FA-OTP (Block S, v2.7) ===

/** Lifetime für Email-OTP-Code (10 Minuten). */
export const EMAIL_OTP_LIFETIME_MS = 10 * 60_000;

/**
 * Generiert einen 6-stelligen numerischen Email-OTP-Code.
 * Server hashed via bcrypt + speichert mit 10min-Expiry.
 */
export function generateEmailOtp(): string {
  // 6 Digits, fuehrende Nullen erlaubt (000123 ist gültig).
  const num = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, '0');
}

export function isEmailOtpValid(expiry: Date | null | undefined): boolean {
  if (!expiry) return false;
  return expiry.getTime() > Date.now();
}
