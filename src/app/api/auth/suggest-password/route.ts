/**
 * GET /api/auth/suggest-password — Server-Side Password-Generator (Block E, v2.5)
 *
 * UI ruft das auf wenn User "Generate Password" klickt.
 * Nutzt server-seitig crypto.randomBytes (deutlich besseres Entropy-Fundament
 * als window.crypto.getRandomValues — wir wollen sicher sein).
 *
 * Kein Auth-Check nötig: das ist nur ein Helper. Rate-Limit jedoch
 * sinnvoll, damit Bots nicht zigtausende Vorschlaege abrufen können.
 */

import { NextResponse } from 'next/server';
import { generateStrongPassword } from '@/lib/auth-security';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const suggestLimit = rateLimit({ interval: 60_000, maxKeys: 500 });

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const ipCheck = suggestLimit.check(`suggest:${ip}`, 30);
  if (!ipCheck.success) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests.' },
      { status: 429 }
    );
  }
  return NextResponse.json({ ok: true, password: generateStrongPassword(16) });
}
