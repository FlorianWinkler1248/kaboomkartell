/**
 * GET /api/twitch/live-status (v2.30, ADR-005 Sektion E)
 *
 * Liefert den aktuellen Live-Status des in SiteSettings.twitchChannel
 * konfigurierten KBK-Channels. Server-side gecached für 30s, damit auch
 * bei hoher /artists- und Player-Last das Helix-Rate-Limit (800/min App)
 * unberührt bleibt.
 *
 * Response (configured):
 *   { configured: true, channel: "kbk4flow", live: true|false, ... }
 * Response (unconfigured oder kein Channel gesetzt):
 *   { configured: false, channel: null, live: false }
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getStreamStatus, type TwitchStreamStatus } from '@/lib/twitch';

const CACHE_TTL_MS = 30_000;

type CacheEntry = {
  fetchedAt: number;
  channel: string | null;
  status: TwitchStreamStatus;
};

// Module-Scope: lebt für die Dauer des Server-Prozesses.
let cache: CacheEntry | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(
      {
        channel: cache.channel,
        ...cache.status,
      },
      { headers: { 'Cache-Control': 'public, max-age=15' } }
    );
  }

  // SiteSettings ist Singleton mit id="singleton".
  const settings = await prisma.siteSettings.findUnique({
    where: { id: 'singleton' },
    select: { twitchChannel: true },
  });

  const channel = settings?.twitchChannel?.trim() || null;
  let status: TwitchStreamStatus;

  if (!channel) {
    status = { live: false, configured: false };
  } else {
    status = await getStreamStatus(channel);
  }

  cache = { fetchedAt: now, channel, status };

  return NextResponse.json(
    {
      channel,
      ...status,
    },
    { headers: { 'Cache-Control': 'public, max-age=15' } }
  );
}
