/**
 * Boomy Playlist-Rotation API
 *
 * POST /api/boomy/rotate-playlists - Rotiert alle fälligen Playlists
 * Geschützt durch Secret-Key Authentifizierung (wie auto-publish).
 *
 * Logik:
 * - weekly-rotation: Top Tracks der letzten 7 Tage (nach Plays + Aura)
 * - monthly-rotation: Top Tracks des letzten Monats
 * - genre-rotation: Zufällige Tracks mit passendem Genre/BPM
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { BOOMY_CONFIG, PLAYLIST_TYPES, TRACK_TYPES, validateBoomySecret } from '@/lib/constants';
import { applyRateLimit, boomyLimit } from '@/lib/rate-limit';

// SoundCloud-Tracks werden in Playlists ausgeschlossen — nur lokale MP3s
const LOCAL_PUBLISHED_FILTER = {
  isPublic: true,
  trackType: TRACK_TYPES.LOCAL,
};

export async function POST(request: NextRequest) {
  // Rate-Limit als Defense-in-Depth zum Secret
  const limited = applyRateLimit(request, boomyLimit, 'boomy-rotate', 60);
  if (limited) return limited;

  try {
    // Secret-Key Authentifizierung
    if (!validateBoomySecret(request.headers.get('Authorization'))) {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const now = new Date();

    // Alle automatischen Playlists laden die rotiert werden müssen
    const playlists = await prisma.playlist.findMany({
      where: {
        isActive: true,
        type: { not: PLAYLIST_TYPES.MANUAL },
        rotationDays: { not: null },
      },
    });

    const results: { name: string; tracksAdded: number }[] = [];

    for (const playlist of playlists) {
      // Prüfen ob Rotation fällig ist
      if (playlist.lastRotatedAt && playlist.rotationDays) {
        const nextRotation = new Date(playlist.lastRotatedAt);
        nextRotation.setDate(nextRotation.getDate() + playlist.rotationDays);
        if (nextRotation > now) continue; // Noch nicht fällig
      }

      let newTracks: { id: string }[] = [];

      if (playlist.type === PLAYLIST_TYPES.WEEKLY_ROTATION) {
        // Top Tracks der letzten 7 Tage (nach Plays + Aura-Votes sortiert)
        const oneWeekAgo = new Date(now);
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        newTracks = await prisma.track.findMany({
          where: {
            ...LOCAL_PUBLISHED_FILTER,
            publishedAt: { gte: oneWeekAgo },
          },
          orderBy: [
            { auraCount: 'desc' },
            { playCount: 'desc' },
          ],
          take: playlist.maxTracks,
          select: { id: true },
        });

        // Wenn nicht genug neue Tracks, mit Top-Tracks aller Zeiten auffüllen
        if (newTracks.length < playlist.maxTracks) {
          const existingIds = newTracks.map((t) => t.id);
          const fillTracks = await prisma.track.findMany({
            where: {
              ...LOCAL_PUBLISHED_FILTER,
              id: { notIn: existingIds },
            },
            orderBy: [
              { auraCount: 'desc' },
              { playCount: 'desc' },
            ],
            take: playlist.maxTracks - newTracks.length,
            select: { id: true },
          });
          newTracks = [...newTracks, ...fillTracks];
        }
      } else if (playlist.type === PLAYLIST_TYPES.MONTHLY_ROTATION) {
        // Top Tracks des letzten Monats
        const oneMonthAgo = new Date(now);
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        newTracks = await prisma.track.findMany({
          where: {
            ...LOCAL_PUBLISHED_FILTER,
            publishedAt: { gte: oneMonthAgo },
          },
          orderBy: [
            { auraCount: 'desc' },
            { playCount: 'desc' },
          ],
          take: playlist.maxTracks,
          select: { id: true },
        });

        // Auffüllen falls nötig
        if (newTracks.length < playlist.maxTracks) {
          const existingIds = newTracks.map((t) => t.id);
          const fillTracks = await prisma.track.findMany({
            where: {
              ...LOCAL_PUBLISHED_FILTER,
              id: { notIn: existingIds },
            },
            orderBy: [
              { auraCount: 'desc' },
              { playCount: 'desc' },
            ],
            take: playlist.maxTracks - newTracks.length,
            select: { id: true },
          });
          newTracks = [...newTracks, ...fillTracks];
        }
      } else if (playlist.type === PLAYLIST_TYPES.GENRE_ROTATION) {
        // Zufällige Tracks mit passendem Genre und BPM (nur lokale MP3s)
        const where: Record<string, unknown> = { ...LOCAL_PUBLISHED_FILTER };
        if (playlist.genre) where.genre = playlist.genre;
        if (playlist.bpmMin || playlist.bpmMax) {
          where.bpm = {
            ...(playlist.bpmMin ? { gte: playlist.bpmMin } : {}),
            ...(playlist.bpmMax ? { lte: playlist.bpmMax } : {}),
          };
        }

        // Alle passenden Tracks laden und zufällig mischen
        const allMatching = await prisma.track.findMany({
          where,
          select: { id: true },
        });

        // Fisher-Yates Shuffle
        for (let i = allMatching.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allMatching[i], allMatching[j]] = [allMatching[j], allMatching[i]];
        }

        newTracks = allMatching.slice(0, playlist.maxTracks);
      }

      if (newTracks.length === 0) continue;

      // Alte Tracks entfernen und neue einfügen (in einer Transaktion)
      await prisma.$transaction([
        prisma.playlistTrack.deleteMany({ where: { playlistId: playlist.id } }),
        ...newTracks.map((track, index) =>
          prisma.playlistTrack.create({
            data: {
              playlistId: playlist.id,
              trackId: track.id,
              position: index,
            },
          })
        ),
        prisma.playlist.update({
          where: { id: playlist.id },
          data: { lastRotatedAt: now },
        }),
      ]);

      results.push({ name: playlist.name, tracksAdded: newTracks.length });
    }

    // WallPost für jede rotierte Playlist (von Boomy)
    if (results.length > 0) {
      const boomyUser = await prisma.user.findUnique({
        where: { username: BOOMY_CONFIG.username },
      });

      if (boomyUser) {
        for (const result of results) {
          try {
            await prisma.wallPost.create({
              data: {
                content: `Fresh rotation! "${result.name}" just got ${result.tracksAdded} new tracks. Go check it out!`,
                type: 'SHOUTOUT',
                authorId: boomyUser.id,
              },
            });
          } catch (e) {
            console.error('WallPost-Fehler bei Playlist-Rotation:', e);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${results.length} playlist(s) rotated.`,
      data: results,
    });
  } catch (error) {
    console.error('Playlist rotation error:', error);
    return NextResponse.json(
      { success: false, error: 'Error rotating playlists.' },
      { status: 500 }
    );
  }
}
