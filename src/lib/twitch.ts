/**
 * Twitch Helix-API Wrapper (v2.30, ADR-005 Sektion E)
 *
 * - App-Access-Token (Client-Credentials-Flow) wird im Server-Memory gecached,
 *   refresh ~5min vor Expiry. Token ist nicht user-gebunden, taugt nur für
 *   public read endpoints (Get Streams, Get Users etc.).
 * - getStreamStatus(login) fragt Helix `/streams?user_login=...` und gibt
 *   einen normalisierten Status zurück.
 * - Wenn TWITCH_CLIENT_ID/SECRET nicht gesetzt sind, kehrt die Funktion
 *   `{ live: false, configured: false }` zurück. Damit fällt der Status
 *   bei fehlender Konfig sauber auf "Coming Soon" zurück statt zu crashen.
 *
 * Pollen tut der Caller (siehe /api/twitch/live-status mit 30s-Cache).
 */

const TOKEN_ENDPOINT = 'https://id.twitch.tv/oauth2/token';
const HELIX_BASE = 'https://api.twitch.tv/helix';

// Token-Cache im Module-Scope (Server-only, überlebt Page-Renders).
type TokenCache = { token: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

export type TwitchStreamStatus =
  | {
      live: false;
      configured: boolean;
      // Wenn configured=true aber live=false: Channel ist offline.
      // Wenn configured=false: Client-ID/Secret fehlen — UI zeigt "Coming Soon".
      error?: string;
    }
  | {
      live: true;
      configured: true;
      title: string;
      gameName: string | null;
      viewerCount: number;
      startedAt: string; // ISO-String
      thumbnailUrl: string; // Twitch-Template-URL mit {width}/{height}
      language: string;
    };

function isConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

async function fetchAppToken(): Promise<string | null> {
  if (!isConfigured()) return null;

  // Cache-Hit (mit 5min Sicherheits-Puffer)
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 5 * 60_000 > now) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID!,
    client_secret: process.env.TWITCH_CLIENT_SECRET!,
    grant_type: 'client_credentials',
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>');
    console.error('[twitch] token request failed', res.status, text);
    tokenCache = null;
    return null;
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return tokenCache.token;
}

export async function getStreamStatus(login: string): Promise<TwitchStreamStatus> {
  if (!isConfigured()) {
    return { live: false, configured: false };
  }
  if (!login) {
    return { live: false, configured: true, error: 'empty login' };
  }

  const token = await fetchAppToken();
  if (!token) {
    return { live: false, configured: true, error: 'token fetch failed' };
  }

  const url = `${HELIX_BASE}/streams?user_login=${encodeURIComponent(login.toLowerCase())}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID!,
        Authorization: `Bearer ${token}`,
      },
      // Server-side fetch, kein Browser-Cache. Caching macht der API-Layer drüber.
      cache: 'no-store',
    });

    if (res.status === 401) {
      // Token abgelaufen oder revoked — Cache leeren, einmal neu probieren.
      tokenCache = null;
      const retryToken = await fetchAppToken();
      if (!retryToken) {
        return { live: false, configured: true, error: 'token retry failed' };
      }
      const retry = await fetch(url, {
        headers: {
          'Client-Id': process.env.TWITCH_CLIENT_ID!,
          Authorization: `Bearer ${retryToken}`,
        },
        cache: 'no-store',
      });
      if (!retry.ok) {
        return { live: false, configured: true, error: `helix ${retry.status}` };
      }
      return parseStreamsResponse(await retry.json());
    }

    if (!res.ok) {
      return { live: false, configured: true, error: `helix ${res.status}` };
    }

    return parseStreamsResponse(await res.json());
  } catch (err) {
    console.error('[twitch] getStreamStatus crashed:', err);
    return { live: false, configured: true, error: 'network' };
  }
}

type HelixStream = {
  user_login: string;
  type: string;
  title: string;
  game_name: string | null;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
  language: string;
};

function parseStreamsResponse(json: unknown): TwitchStreamStatus {
  const data = (json as { data?: HelixStream[] })?.data;
  if (!data || data.length === 0) {
    return { live: false, configured: true };
  }
  const s = data[0];
  // type !== 'live' kann theoretisch vorkommen (rerun/playlist) — wir behandeln
  // alles ausser leerem data-Array als live, weil Helix bei Vodcasts auch
  // 'rerun' liefert. Klare Trennung wäre Stufe-2-Feinheit.
  return {
    live: true,
    configured: true,
    title: s.title,
    gameName: s.game_name,
    viewerCount: s.viewer_count,
    startedAt: s.started_at,
    thumbnailUrl: s.thumbnail_url,
    language: s.language,
  };
}
