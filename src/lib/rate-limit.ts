/**
 * Rate-Limit-Helper — Sliding-Window-Counter mit nativer Map.
 *
 * In-memory pro KBK-Container-Instanz. Bei Container-Restart werden alle
 * Counter resetted (für unsere Single-Instance-Deployment OK).
 *
 * Keine externe Dependency — `lru-cache` ist im pnpm-Container nur als
 * transitive Dep vorhanden, direkt-import schlägt fehl.
 *
 * Pattern:
 *   const limit = rateLimit({ interval: 60_000, maxKeys: 500 });
 *   const { success, remaining } = limit.check(`vote:${ip}`, 20);
 *   if (!success) return 429;
 */

import { NextResponse } from 'next/server';

interface RateLimitOptions {
  /** Maximum unique tracking keys (z.B. IPs). LRU-Eviction bei Überschreiten. */
  maxKeys?: number;
  /** Sliding-Window-Länge in ms */
  interval?: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetMs: number;
}

interface Limiter {
  check(token: string, limit: number): RateLimitResult;
}

export function rateLimit(options: RateLimitOptions = {}): Limiter {
  const interval = options.interval ?? 60_000;
  const maxKeys = options.maxKeys ?? 1000;
  const tokens = new Map<string, number[]>();

  return {
    check(token: string, limit: number): RateLimitResult {
      const now = Date.now();
      const cutoff = now - interval;
      const arr = (tokens.get(token) ?? []).filter((t) => t > cutoff);

      if (arr.length >= limit) {
        const oldest = arr[0] ?? now;
        return {
          success: false,
          remaining: 0,
          resetMs: Math.max(1, interval - (now - oldest)),
        };
      }

      arr.push(now);
      tokens.set(token, arr);

      // Cleanup: wenn zu viele Keys gespeichert, ältere entfernen.
      // Map iteriert in Insertion-Order, also löschen wir die ältesten zuerst.
      if (tokens.size > maxKeys) {
        const overflow = tokens.size - maxKeys;
        const iter = tokens.keys();
        for (let i = 0; i < overflow; i++) {
          const k = iter.next().value;
          if (k !== undefined) tokens.delete(k);
        }
      }

      return { success: true, remaining: limit - arr.length, resetMs: interval };
    },
  };
}

/**
 * Einheitliche IP-Extraktion. Vertrauensmodell (verifiziert 12.06.2026):
 * Caddy ≥2.5 OHNE `trusted_proxies` verwirft client-gesendete
 * `x-forwarded-for`-Header und setzt die echte Client-IP als einzigen
 * Eintrag — `[0]` ist daher nicht spoofbar. Der App-Port ist per Firewall
 * nur intern erreichbar (kein Direct-Hit-Pfad an Caddy vorbei).
 *
 * Funktioniert mit Web-`Request` UND Next.js `NextRequest` (NextRequest extends Request).
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim();
  }
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

/**
 * Hilfs-Wrapper: gibt 429 mit Retry-After-Header zurück, wenn rate-exceeded.
 * Sonst null (Caller darf weitermachen).
 */
export function applyRateLimit(
  request: Request,
  limiter: Limiter,
  bucket: string,
  limit: number
): NextResponse | null {
  const ip = getClientIp(request);
  const { success, resetMs } = limiter.check(`${bucket}:${ip}`, limit);
  if (!success) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Slow down.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(resetMs / 1000)),
        },
      }
    );
  }
  return null;
}

// === Pre-konfigurierte Limiter pro Endpoint-Klasse ===
//
// Module-singleton: jede Limiter-Instance hält ihre eigene Map.
// Wenn der Endpoint-Code `import { registerLimit } from '@/lib/rate-limit'`
// macht, teilen sich alle Aufrufer denselben Counter.

/** 5 Registrierungen pro Stunde pro IP. Hauptziel von Spam-Bots. */
export const registerLimit = rateLimit({ interval: 3_600_000, maxKeys: 1000 });

/** 20 Track-Votes pro Minute pro IP. Anti-Vote-Manipulation. */
export const voteLimit = rateLimit({ interval: 60_000, maxKeys: 1000 });

/** 30 Play-Counts pro Minute pro IP. Anti-Play-Inflation. */
export const playLimit = rateLimit({ interval: 60_000, maxKeys: 1000 });

/** 60 Boomy-Endpoint-Calls pro Minute pro IP. Defense-in-Depth zum Secret. */
export const boomyLimit = rateLimit({ interval: 60_000, maxKeys: 100 });

/** 30 Uploads pro Minute pro IP. Schützt den teuren Multipart-Upload (Admin-only, Defense-in-Depth). */
export const uploadLimit = rateLimit({ interval: 60_000, maxKeys: 200 });

/** 30 Crowd-Control-Votes pro Minute pro IP. Eigener Bucket (NICHT voteLimit), damit
 *  Umentscheiden + Live-Voting nicht das Track-AURA/SUS-Budget aufbrauchen. */
export const radioVoteLimit = rateLimit({ interval: 60_000, maxKeys: 1000 });

/** OTP-Verifikations-Versuche pro Minute pro IP (6-stellige Codes, 10^6-Raum).
 *  Bremst Brute-Force auf die kurzlebigen 2FA-Setup-/Login-Codes. */
export const twoFactorLimit = rateLimit({ interval: 60_000, maxKeys: 500 });

/** 60 Aufrufe/min pro IP für das öffentliche Hilfe-Center. Reine Flood-Hygiene —
 *  das Prozess-Bundle liegt In-Memory gecacht, teuer ist nichts. */
export const publicProcessesLimit = rateLimit({ interval: 60_000, maxKeys: 500 });

/** 10 Mission-Accept-/Withdraw-Versuche pro Minute pro IP (ADR-039). Eigener
 *  Bucket — NICHT voteLimit mitverbrauchen, damit ein Accept-Bot nicht das
 *  Voting-Budget legitimer User frisst. In-Memory-Reset bei Restart ist
 *  akzeptiert (Single-Instance); die harte Garantie gegen Doppel-Accept ist
 *  das @@unique in MissionAcceptance, nicht dieses Limit. */
export const missionLimit = rateLimit({ interval: 60_000, maxKeys: 1000 });

/** 3 Artist-Bewerbungs-Versuche pro Stunde pro IP (ADR-039). Defense-in-Depth —
 *  die harte "1 Bewerbung pro Account"-Garantie ist das DB-unique auf
 *  ArtistApplication.userId (P2002 → 409), nicht dieses Limit. Großzügig genug,
 *  dass Validierungs-Korrekturen (400-Schleife) niemanden aussperren. */
export const artistApplyLimit = rateLimit({ interval: 3_600_000, maxKeys: 500 });

/** 5 Session-Like-Importe pro Stunde pro IP (ADR-041). Der Import upsertet bis
 *  zu 100 Votes pro Call — eigener knapper Bucket statt voteLimit. */
export const likeImportLimit = rateLimit({ interval: 3_600_000, maxKeys: 500 });
