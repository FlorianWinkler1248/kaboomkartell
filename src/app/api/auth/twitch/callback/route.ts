/**
 * GET /api/auth/twitch/callback (v2.30, ADR-005 Sektion F)
 *
 * Tauscht den Authorization-Code gegen Access-/Refresh-Token, holt das
 * Twitch-User-Profil und legt eine `LinkedAccount`-Zeile für den
 * aktuell eingeloggten KBK-User an (upsert).
 *
 * Pfad:
 *   1. State-Cookie validieren (CSRF-Schutz gegen fremde Callback-Triggers)
 *   2. Code gegen Token tauschen (POST /oauth2/token)
 *   3. /helix/users mit access_token aufrufen
 *   4. LinkedAccount upsert + Token verschlüsselt speichern
 *   5. Redirect zu /settings/connections?status=ok|<error-code>
 *
 * Erfolg + Fehler reden über Query-Param mit der Settings-Page — kein
 * Toast/Banner-API, weil Server-Redirects keinen Client-State pflegen.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { encryptSecret } from '@/lib/auth-security';
import { logSecurityEvent } from '@/lib/security-log';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_USERS_URL = 'https://api.twitch.tv/helix/users';
const STATE_COOKIE = 'twitch_oauth_state';
const SETTINGS_PATH = '/settings/connections';

function buildRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? 'https://kaboomkartell.com';
  return `${base.replace(/\/$/, '')}/api/auth/twitch/callback`;
}

function redirectBack(status: string, request: NextRequest) {
  const url = new URL(SETTINGS_PATH, request.url);
  url.searchParams.set('twitch', status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return redirectBack('not-authenticated', request);
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectBack('not-configured', request);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    // User hat „cancel" auf Twitch geklickt o.ae. — kein Drama.
    return redirectBack('cancelled', request);
  }

  if (!code || !state) {
    return redirectBack('missing-params', request);
  }

  const cookieStore = await cookies();
  const cookieState = cookieStore.get(STATE_COOKIE)?.value;
  // State-Cookie löschen, egal ob OK oder Fehler — kein Replay.
  cookieStore.set(STATE_COOKIE, '', {
    path: '/api/auth/twitch',
    maxAge: 0,
  });

  if (!cookieState || cookieState !== state) {
    return redirectBack('state-mismatch', request);
  }

  // Token-Exchange
  const tokenBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: buildRedirectUri(),
  });

  let tokenJson: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string[];
  };
  try {
    const tokenRes = await fetch(TWITCH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    if (!tokenRes.ok) {
      console.error('[twitch-oauth] token exchange failed', tokenRes.status, await tokenRes.text().catch(() => '<no body>'));
      return redirectBack('token-exchange-failed', request);
    }
    tokenJson = await tokenRes.json();
  } catch (err) {
    console.error('[twitch-oauth] token fetch crashed:', err);
    return redirectBack('token-network-error', request);
  }

  // User-Identity holen
  let user: { id: string; login: string; display_name: string };
  try {
    const userRes = await fetch(TWITCH_USERS_URL, {
      headers: {
        'Client-Id': clientId,
        Authorization: `Bearer ${tokenJson.access_token}`,
      },
    });
    if (!userRes.ok) {
      return redirectBack('users-fetch-failed', request);
    }
    const userJson = (await userRes.json()) as { data?: Array<{ id: string; login: string; display_name: string }> };
    if (!userJson.data || userJson.data.length === 0) {
      return redirectBack('users-empty', request);
    }
    user = userJson.data[0];
  } catch (err) {
    console.error('[twitch-oauth] /users crashed:', err);
    return redirectBack('users-network-error', request);
  }

  const expiresAt = new Date(Date.now() + tokenJson.expires_in * 1000);

  // Prüfen ob dieser Twitch-Account bereits an einen anderen KBK-User
  // gebunden ist. @@unique(provider, providerUserId) wäre ein Constraint-
  // Crash bei Upsert über userId — wir müssen erst checken.
  const existing = await prisma.linkedAccount.findUnique({
    where: {
      provider_providerUserId: { provider: 'twitch', providerUserId: user.id },
    },
    select: { userId: true },
  });
  if (existing && existing.userId !== session.user.id) {
    return redirectBack('already-linked-elsewhere', request);
  }

  await prisma.linkedAccount.upsert({
    where: {
      provider_providerUserId: { provider: 'twitch', providerUserId: user.id },
    },
    update: {
      userId: session.user.id,
      providerName: user.login,
      accessToken: encryptSecret(tokenJson.access_token),
      refreshToken: tokenJson.refresh_token ? encryptSecret(tokenJson.refresh_token) : null,
      expiresAt,
    },
    create: {
      userId: session.user.id,
      provider: 'twitch',
      providerUserId: user.id,
      providerName: user.login,
      accessToken: encryptSecret(tokenJson.access_token),
      refreshToken: tokenJson.refresh_token ? encryptSecret(tokenJson.refresh_token) : null,
      expiresAt,
    },
  });

  // Den display-channel des Users gleich mit setzen, wenn noch leer
  // — User-Erwartung „ich habe Twitch verbunden, dann sollte mein Profil das auch zeigen".
  await prisma.user.updateMany({
    where: { id: session.user.id, twitchChannel: null },
    data: { twitchChannel: user.login.toLowerCase() },
  });

  await logSecurityEvent('account_linked', {
    userId: session.user.id,
    request,
    metadata: { provider: 'twitch', providerName: user.login },
  });

  return redirectBack('ok', request);
}
