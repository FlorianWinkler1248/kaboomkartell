/**
 * My-Playlist API (ADR-041)
 *
 * GET /api/me/playlist — die Aura+-Likes des eingeloggten Users als
 * Playlist-Ableitung. Kein eigenes Playlist-Modell: „My Playlist" ist die
 * Sicht auf `Vote WHERE aura=true` (join Track, nur öffentliche Tracks).
 * Lesen ist ab T0 erlaubt (eigene Daten); Schreiben läuft über die
 * bestehende Vote-Route.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { formatArtistDisplay } from '@/lib/track-display';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 401 }
      );
    }

    const votes = await prisma.vote.findMany({
      where: {
        userId: session.user.id,
        aura: true,
        track: { isPublic: true },
      },
      include: {
        track: {
          include: {
            artist: { select: { id: true, username: true, displayName: true } },
            featuringArtist: { select: { id: true, username: true, displayName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const tracks = votes.map((v) => ({
      id: v.track.id,
      title: v.track.title,
      slug: v.track.slug,
      trackType: v.track.trackType,
      duration: v.track.duration,
      coverUrl: v.track.coverUrl || v.track.soundcloudArtwork || null,
      genre: v.track.genre,
      artistLabel: formatArtistDisplay(v.track),
      streamUrl: v.track.trackType === 'LOCAL' ? `/api/tracks/${v.track.id}/stream` : '',
      soundcloudUrl: v.track.trackType === 'SOUNDCLOUD' ? v.track.soundcloudUrl : null,
      soundcloudEmbedUrl:
        v.track.trackType === 'SOUNDCLOUD' ? v.track.soundcloudEmbedUrl : null,
      // sus mitliefern, damit ein Unlike den bestehenden Sus-Zustand nicht klobbert.
      sus: v.sus,
      likedAt: v.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data: { tracks } });
  } catch (error) {
    console.error('My-Playlist GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Error loading your playlist.' },
      { status: 500 }
    );
  }
}
