/**
 * Newsletter-Unsubscribe — fälschungssicherer Ein-Klick-Abmeldelink (P1.1 / ADR-035).
 *
 * DSGVO vor Reichweite: BEVOR die erste Broadcast-Mail rausgeht, muss jeder Empfänger
 * sich ohne Login abmelden können. Der Link trägt eine HMAC-Signatur über der userId —
 * kein neues Schema-Feld, kein Login nötig (der Klick kommt aus der Mail).
 *
 * Secret wird aus NEXTAUTH_SECRET abgeleitet (eigener Namespace, damit die Signatur
 * nicht mit anderen HMACs kollidiert). server-only (liest process.env).
 */

import crypto from 'node:crypto';

function unsubscribeSecret(): Buffer {
  const base = process.env.NEXTAUTH_SECRET;
  if (!base) throw new Error('NEXTAUTH_SECRET fehlt — Unsubscribe-Signatur nicht möglich');
  return crypto.createHash('sha256').update(`newsletter-unsubscribe:${base}`).digest();
}

/** HMAC-Signatur (hex) für den Unsubscribe-Link eines Users. */
export function signUnsubscribe(userId: string): string {
  return crypto.createHmac('sha256', unsubscribeSecret()).update(userId).digest('hex');
}

/** Prüft die Signatur konstant-zeitlich. Ungültige/leere Werte → false (kein Throw). */
export function verifyUnsubscribe(userId: string, sig: string): boolean {
  if (!userId || !sig) return false;
  const expected = signUnsubscribe(userId);
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/** Vollständige Unsubscribe-URL für den Mail-Footer. `base` = öffentliche Site-URL. */
export function unsubscribeUrl(base: string, userId: string): string {
  const u = new URL('/api/newsletter/unsubscribe', base);
  u.searchParams.set('uid', userId);
  u.searchParams.set('sig', signUnsubscribe(userId));
  return u.toString();
}
