/**
 * Device-Code-Flow (P2.5 / ADR-035) — der „Bring your human"-Moment.
 *
 * Ein Agent startet einen Link-Vorgang und bekommt einen kurzen `userCode`, den sein
 * Mensch auf /agent/authorize eingibt (eingeloggt) + bestätigt. Danach holt der Agent
 * per `deviceCode` genau EINMAL seinen PAT ab.
 *
 * Speicher: modul-lokale Map (Single-Instance-Deployment, systemd). 10-min-TTL, one-time.
 * Ein Server-Restart verwirft pending Codes — akzeptabel (der Mensch startet neu).
 * KEIN Schema-Change.
 */

import { randomBytes } from 'node:crypto';

const TTL_MS = 10 * 60 * 1000;
// Ohne ambivalente Zeichen (I, O, 0, 1) — leichter abzutippen.
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const DEVICE_CODE_TTL_SEC = TTL_MS / 1000;

interface DeviceCodeEntry {
  userCode: string; // "ABCD-2345" (mit Bindestrich, uppercase)
  deviceCode: string; // geheim, hält der Agent
  scopes: string[];
  tokenName: string;
  createdAt: number;
  status: 'pending' | 'approved';
  userId?: string;
  issuedToken?: string | null; // Klartext-PAT, genau EINMAL abholbar
}

const byDeviceCode = new Map<string, DeviceCodeEntry>();
const byUserCode = new Map<string, string>(); // userCode -> deviceCode

function prune(now: number): void {
  for (const [dc, e] of byDeviceCode) {
    if (now - e.createdAt > TTL_MS) {
      byDeviceCode.delete(dc);
      byUserCode.delete(e.userCode);
    }
  }
}

function randUserCode(): string {
  const bytes = randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Normalisiert eine User-Eingabe auf das gespeicherte "XXXX-XXXX"-Format. */
export function normalizeUserCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export function createDeviceCode(
  scopes: string[],
  tokenName: string,
  now: number = Date.now(),
): { userCode: string; deviceCode: string } {
  prune(now);
  const deviceCode = randomBytes(32).toString('base64url');
  let userCode = randUserCode();
  while (byUserCode.has(userCode)) userCode = randUserCode();
  byDeviceCode.set(deviceCode, {
    userCode, deviceCode, scopes, tokenName, createdAt: now, status: 'pending', issuedToken: null,
  });
  byUserCode.set(userCode, deviceCode);
  return { userCode, deviceCode };
}

/** Sicht des Menschen: pending Eintrag zu einem userCode (oder null). */
export function lookupByUserCode(userCode: string, now: number = Date.now()): DeviceCodeEntry | null {
  prune(now);
  const dc = byUserCode.get(normalizeUserCode(userCode));
  if (!dc) return null;
  const e = byDeviceCode.get(dc);
  return e && now - e.createdAt <= TTL_MS ? e : null;
}

/** Mensch bestätigt: hängt userId + Klartext-PAT an, markiert approved. */
export function approveDeviceCode(
  userCode: string,
  userId: string,
  issuedToken: string,
  now: number = Date.now(),
): boolean {
  const e = lookupByUserCode(userCode, now);
  if (!e || e.status === 'approved') return false;
  e.status = 'approved';
  e.userId = userId;
  e.issuedToken = issuedToken;
  return true;
}

/** Agent pollt: Status; bei approved wird der PAT genau EINMAL ausgeliefert, dann gelöscht. */
export function pollDeviceCode(
  deviceCode: string,
  now: number = Date.now(),
): { status: 'pending' | 'approved' | 'expired'; token?: string } {
  prune(now);
  const e = byDeviceCode.get(deviceCode);
  if (!e || now - e.createdAt > TTL_MS) return { status: 'expired' };
  if (e.status !== 'approved') return { status: 'pending' };
  const token = e.issuedToken ?? undefined;
  // Genau einmal ausliefern → Eintrag entfernen (der PAT lebt jetzt beim Agenten).
  byDeviceCode.delete(deviceCode);
  byUserCode.delete(e.userCode);
  return { status: 'approved', token };
}
