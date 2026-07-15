/**
 * GET /api/auth/discord/start (ADR-005 Sektion F)
 *
 * Startet den Discord-OAuth-Account-Linking-Flow für den aktuell
 * eingeloggten KBK-User. KBK bleibt Identity-Master — Discord wird nur
 * verlinkt, nicht zur Login-Methode.
 *
 * Pfad:
 *   1. Auth-Check (nur eingeloggte User können verlinken)
 *   2. CSRF-State-Token erzeugen + in HttpOnly-Cookie ablegen
 *   3. Redirect zur Discord-Authorize-URL
 *
 * Fehlt DISCORD_CLIENT_ID: 503 — gracefuller Fallback, /settings/connections
 * zeigt entsprechende Meldung und deaktiviert den Connect-Button.
 *
 * Spiegelt 1:1 das Twitch-Muster (siehe ../twitch/start).
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';

const DISCORD_AUTHORIZE_URL = 'https://discord.com/api/oauth2/authorize';
const STATE_COOKIE = 'discord_oauth_state';

function buildRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? 'https://kaboomkartell.com';
  return `${base.replace(/\/$/, '')}/api/auth/discord/callback`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated.' },
      { status: 401 }
    );
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { success: false, error: 'Discord integration not configured yet.' },
      { status: 503 }
    );
  }

  const state = randomBytes(32).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: buildRedirectUri(),
    response_type: 'code',
    // identify = Discord-User-ID + Username, mehr brauchen wir fürs Linking nicht.
    scope: 'identify',
    state,
    prompt: 'consent', // immer Re-Bestätigung, kein silent re-link
  });

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/discord',
    maxAge: 10 * 60, // 10 Minuten — sollte für den Authorize-Flow reichen
  });

  return NextResponse.redirect(`${DISCORD_AUTHORIZE_URL}?${params.toString()}`);
}
