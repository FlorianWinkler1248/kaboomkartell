/**
 * GET /api/auth/twitch/start (v2.30, ADR-005 Sektion F)
 *
 * Startet den Twitch-OAuth-Account-Linking-Flow für den aktuell
 * eingeloggten KBK-User. KBK bleibt Identity-Master — Twitch wird nur
 * verlinkt, nicht zur Login-Methode.
 *
 * Pfad:
 *   1. Auth-Check (nur eingeloggte User können verlinken)
 *   2. CSRF-State-Token erzeugen + in HttpOnly-Cookie ablegen
 *   3. Redirect zu Twitch-Authorize-URL
 *
 * Fehlt TWITCH_CLIENT_ID: 503 — gracefuller Fallback, /settings/connections
 * zeigt entsprechende Meldung.
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';

const TWITCH_AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
const STATE_COOKIE = 'twitch_oauth_state';

function buildRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? 'https://kaboomkartell.com';
  return `${base.replace(/\/$/, '')}/api/auth/twitch/callback`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated.' },
      { status: 401 }
    );
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { success: false, error: 'Twitch integration not configured yet.' },
      { status: 503 }
    );
  }

  const state = randomBytes(32).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: buildRedirectUri(),
    response_type: 'code',
    // Scope leer = nur public Identity. Reicht für /helix/users-Read.
    scope: '',
    state,
    force_verify: 'true', // immer Re-Bestätigung, kein silent re-link
  });

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/twitch',
    maxAge: 10 * 60, // 10 Minuten — sollte für den Authorize-Flow reichen
  });

  return NextResponse.redirect(`${TWITCH_AUTHORIZE_URL}?${params.toString()}`);
}
