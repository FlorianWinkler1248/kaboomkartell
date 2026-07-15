/**
 * GET /api/auth/discord/callback (ADR-005 Sektion F)
 *
 * Tauscht den Authorization-Code gegen Access-/Refresh-Token, holt das
 * Discord-User-Profil und legt eine `LinkedAccount`-Zeile für den
 * aktuell eingeloggten KBK-User an (upsert).
 *
 * Pfad:
 *   1. State-Cookie validieren (CSRF-Schutz gegen fremde Callback-Triggers)
 *   2. Code gegen Token tauschen (POST /oauth2/token)
 *   3. /users/@me mit access_token aufrufen
 *   4. LinkedAccount upsert — nur providerUserId + providerName (DSGVO,
 *      Stufe 1): Access-/Refresh-Token werden nach dem /users/@me-Call
 *      verworfen, nie persistiert (kein Bot, kein Re-Sync nötig).
 *   5. Redirect zu /settings/connections?discord=ok|<error-code>
 *
 * Erfolg + Fehler reden über Query-Param mit der Settings-Page — kein
 * Toast/Banner-API, weil Server-Redirects keinen Client-State pflegen.
 *
 * Spiegelt 1:1 das Twitch-Muster (siehe ../twitch/callback).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { logSecurityEvent } from '@/lib/security-log';

const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/users/@me';
const STATE_COOKIE = 'discord_oauth_state';
const SETTINGS_PATH = '/settings/connections';

function buildRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? 'https://kaboomkartell.com';
  return `${base.replace(/\/$/, '')}/api/auth/discord/callback`;
}

function redirectBack(status: string, request: NextRequest) {
  const url = new URL(SETTINGS_PATH, request.url);
  url.searchParams.set('discord', status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return redirectBack('not-authenticated', request);
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectBack('not-configured', request);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    // User hat „cancel" auf Discord geklickt o.ae. — kein Drama.
    return redirectBack('cancelled', request);
  }

  if (!code || !state) {
    return redirectBack('missing-params', request);
  }

  const cookieStore = await cookies();
  const cookieState = cookieStore.get(STATE_COOKIE)?.value;
  // State-Cookie löschen, egal ob OK oder Fehler — kein Replay.
  cookieStore.set(STATE_COOKIE, '', {
    path: '/api/auth/discord',
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

  let tokenJson: { access_token: string };
  try {
    const tokenRes = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    if (!tokenRes.ok) {
      console.error('[discord-oauth] token exchange failed', tokenRes.status, await tokenRes.text().catch(() => '<no body>'));
      return redirectBack('token-exchange-failed', request);
    }
    tokenJson = await tokenRes.json();
  } catch (err) {
    console.error('[discord-oauth] token fetch crashed:', err);
    return redirectBack('token-network-error', request);
  }

  // User-Identity holen
  let user: { id: string; username: string; global_name?: string | null };
  try {
    const userRes = await fetch(DISCORD_USER_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!userRes.ok) {
      return redirectBack('users-fetch-failed', request);
    }
    user = (await userRes.json()) as { id: string; username: string; global_name?: string | null };
  } catch (err) {
    console.error('[discord-oauth] /users/@me crashed:', err);
    return redirectBack('users-network-error', request);
  }

  if (!user?.id) {
    return redirectBack('users-empty', request);
  }

  // global_name ist der neue Anzeigename, username der @-Handle — wir nehmen
  // den Anzeigenamen wenn vorhanden, sonst den Handle.
  const providerName = user.global_name || user.username;

  // Prüfen ob dieser Discord-Account bereits an einen anderen KBK-User
  // gebunden ist. @@unique(provider, providerUserId) wäre ein Constraint-
  // Crash bei Upsert über userId — wir müssen erst checken.
  const existing = await prisma.linkedAccount.findUnique({
    where: {
      provider_providerUserId: { provider: 'discord', providerUserId: user.id },
    },
    select: { userId: true },
  });
  if (existing && existing.userId !== session.user.id) {
    return redirectBack('already-linked-elsewhere', request);
  }

  // DSGVO (Stufe 1): Nur Identität speichern. Access-/Refresh-Token werden
  // bewusst NICHT persistiert — beim Re-Link werden evtl. alte Token-Spalten
  // zusätzlich auf null gesetzt, damit nichts aus früheren Versionen liegen bleibt.
  await prisma.linkedAccount.upsert({
    where: {
      provider_providerUserId: { provider: 'discord', providerUserId: user.id },
    },
    update: {
      userId: session.user.id,
      providerName,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    },
    create: {
      userId: session.user.id,
      provider: 'discord',
      providerUserId: user.id,
      providerName,
    },
  });

  await logSecurityEvent('account_linked', {
    userId: session.user.id,
    request,
    metadata: { provider: 'discord', providerName },
  });

  return redirectBack('ok', request);
}
