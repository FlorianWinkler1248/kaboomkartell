/**
 * Boomy Auto-Publish API
 *
 * POST /api/boomy/auto-publish
 *   Wählt zufällig einen wartenden KI-Track (aiDisclosure='ai_generated',
 *   isPublic=false), setzt isPublic=true und postet eine organisch
 *   wirkende Wall-Ankündigung.
 *
 * GET /api/boomy/auto-publish (Dry-Run, gleicher Auth-Header)
 *   Liefert Pool-Stats ohne etwas zu releasen — für Status-Widget
 *   und Tagesreport.
 *
 * Auth: Authorization-Header == BOOMY_CONFIG.autoPublishSecret.
 *
 * Hinweis Cover-Generation: Im externen Boomy-Workflow ruft Boomy
 * vor diesem Endpoint den Cover-Generator auf und sendet `coverUrl` mit.
 * Wenn `coverUrl` mitgeschickt wird, wird sie auf den Track geschrieben.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { BOOMY_CONFIG, BOOMY_PURPLE, validateBoomySecret } from '@/lib/constants';
import {
  composeReleaseAnnouncement,
  getReleaseQueueStats,
  pickReleaseCandidate,
} from '@/lib/boomy';
import { postToDiscord, hexToDiscordColor } from '@/lib/discord-webhook';
import { applyRateLimit, boomyLimit } from '@/lib/rate-limit';
import { tryGetMp3Duration } from '@/lib/mp3-duration';
import path from 'path';

export async function POST(request: NextRequest) {
  // Rate-Limit als Defense-in-Depth zum Secret
  const limited = applyRateLimit(request, boomyLimit, 'boomy-publish', 60);
  if (limited) return limited;

  try {
    if (!validateBoomySecret(request.headers.get('Authorization'))) {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    // Optional: Cover-URL UND/ODER explizite trackId vom externen Boomy-Agenten mitgegeben.
    // trackId greift, wenn vorher /peek-release aufgerufen wurde — dann Cover für
    // diesen Titel generiert, dann finalize mit gleicher ID. Ohne ID → Random-Pick.
    let coverUrl: string | undefined;
    let explicitTrackId: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.coverUrl === 'string' && body.coverUrl.trim()) {
        coverUrl = body.coverUrl.trim();
      }
      if (body && typeof body.trackId === 'string' && body.trackId.trim()) {
        explicitTrackId = body.trackId.trim();
      }
    } catch {
      // kein Body, kein Problem
    }

    const candidate = await pickReleaseCandidate(
      explicitTrackId ? { trackId: explicitTrackId } : undefined
    );

    // Alle KI-Pools leer → 204 No Content (Boomy meldet das im Tagesreport)
    if (!candidate) {
      return new NextResponse(null, { status: 204 });
    }

    // v2.26 (07.05.2026): Auto-Duration-Extraction beim Release.
    // Vor dem Publish lesen wir Duration aus MP3-Header, wenn sie noch 0 ist.
    // Das schließt die Luecke aus dem Boomy-Pipeline-Pfad — Seed-Skripte
    // setzen duration=0, ohne Backfill blieb sie auf 0 stehen.
    const trackBeforeUpdate = await prisma.track.findUnique({
      where: { id: candidate.trackId },
      select: { duration: true, filePath: true, trackType: true },
    });
    let extractedDuration: number | null = null;
    if (
      trackBeforeUpdate &&
      trackBeforeUpdate.duration <= 0 &&
      trackBeforeUpdate.trackType === 'LOCAL' &&
      trackBeforeUpdate.filePath
    ) {
      const fullPath = path.isAbsolute(trackBeforeUpdate.filePath)
        ? trackBeforeUpdate.filePath
        : path.join('/app/uploads', trackBeforeUpdate.filePath);
      extractedDuration = tryGetMp3Duration(fullPath);
      if (!extractedDuration) {
        console.warn(
          `[auto-publish] Duration-Extraction fehlgeschlagen für ${candidate.trackId} (path=${fullPath})`
        );
      }
    }

    const publishedTrack = await prisma.track.update({
      where: { id: candidate.trackId },
      data: {
        isPublic: true,
        publishedAt: new Date(),
        ...(coverUrl ? { coverUrl } : {}),
        ...(extractedDuration ? { duration: extractedDuration } : {}),
      },
      include: {
        artist: { select: { id: true, username: true, displayName: true } },
      },
    });

    // Organisch wirkenden Drop-Announce auf die KBK-Wall
    try {
      const content = composeReleaseAnnouncement({
        title: publishedTrack.title,
        genre: candidate.genre,
      });
      await prisma.wallPost.create({
        data: {
          content,
          type: 'SHOUTOUT',
          authorId: publishedTrack.artist.id,
        },
      });

      // ADR-005 D: Release zusätzlich in den Discord-#radio-feed spiegeln.
      // postToDiscord wirft nie — ein Webhook-Fehler bleibt folgenlos.
      const coverUrl = publishedTrack.coverUrl;
      const discordCover = coverUrl
        ? coverUrl.startsWith('http')
          ? coverUrl
          : `${(process.env.NEXTAUTH_URL ?? 'https://kaboomkartell.com').replace(/\/$/, '')}${coverUrl}`
        : undefined;
      await postToDiscord({
        username: 'Boomy',
        embeds: [
          {
            title: publishedTrack.title,
            description: content,
            color: hexToDiscordColor(BOOMY_PURPLE),
            thumbnail: discordCover ? { url: discordCover } : undefined,
            footer: {
              text: candidate.genre ? `New on KBK · ${candidate.genre}` : 'New on KBK',
            },
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (wallPostError) {
      console.error('Fehler beim Wall-Post:', wallPostError);
    }

    return NextResponse.json({
      success: true,
      message: 'Track published.',
      data: {
        id: publishedTrack.id,
        title: publishedTrack.title,
        slug: publishedTrack.slug,
        genre: publishedTrack.genre,
        coverUrl: publishedTrack.coverUrl,
        artist: publishedTrack.artist,
        publishedAt: publishedTrack.publishedAt,
      },
    });
  } catch (error) {
    console.error('Boomy auto-publish error:', error);
    return NextResponse.json(
      { success: false, error: 'Error publishing track.' },
      { status: 500 }
    );
  }
}

/**
 * GET = Dry-Run / Status-Abfrage. Liefert Pool-Stats für Tagesreport + Widget.
 */
export async function GET(request: NextRequest) {
  if (!validateBoomySecret(request.headers.get('Authorization'))) {
    return NextResponse.json(
      { success: false, error: 'Not authorized.' },
      { status: 403 }
    );
  }

  const stats = await getReleaseQueueStats();

  return NextResponse.json({
    success: true,
    data: {
      threshold: BOOMY_CONFIG.poolLowThreshold,
      releaseIntervalDays: BOOMY_CONFIG.releaseIntervalDays,
      waitingTracks: stats.waitingTracks,
      publicTracks: stats.publicTracks,
      byGenre: stats.byGenre,
      belowThreshold: stats.belowThreshold,
      hasReleaseCandidate: stats.waitingTracks > 0,
    },
  });
}
