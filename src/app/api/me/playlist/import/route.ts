/**
 * Session-Like-Import (ADR-041)
 *
 * POST /api/me/playlist/import — übernimmt anonyme Session-Likes
 * (localStorage) nach der Registrierung als echte Aura+-Votes.
 *
 * Kein-Blenden-Regel bleibt serverseitig intakt: LOCAL-Tracks werden nur mit
 * getrackter Hörzeit >= 60s importiert, SOUNDCLOUD ohne Hörzeit-Pflicht
 * (Partition-Logik: lib/my-playlist.ts). Gate: T1 (Email verifiziert) —
 * gleiche Schwelle wie normales Voten via Trust-Tier-Modell.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { requireTier, PermissionError } from '@/lib/permissions';
import { importLikesSchema } from '@/lib/validations';
import { partitionImportLikes } from '@/lib/my-playlist';
import { recalcTrackVoteStats } from '@/lib/vote-aggregate';
import { applyRateLimit, likeImportLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const limited = applyRateLimit(request, likeImportLimit, 'like-import', 5);
  if (limited) return limited;

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 401 }
      );
    }

    try {
      await requireTier(session.user.id, 'T1');
    } catch (e) {
      if (e instanceof PermissionError) {
        return NextResponse.json(
          { success: false, error: 'Verify your email first to import your likes.' },
          { status: 403 }
        );
      }
      throw e;
    }

    const body = await request.json();
    const result = importLikesSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const likes = result.data.likes;
    const tracks = await prisma.track.findMany({
      where: { id: { in: likes.map((l) => l.trackId) } },
      select: { id: true, trackType: true, isPublic: true },
    });

    const { importable, skipped } = partitionImportLikes(tracks, likes);

    if (importable.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const like of importable) {
          await tx.vote.upsert({
            where: {
              userId_trackId: {
                userId: session.user.id,
                trackId: like.trackId,
              },
            },
            create: {
              userId: session.user.id,
              trackId: like.trackId,
              aura: true,
              sus: false,
              listenedSeconds: like.listenedSeconds,
            },
            // Bestehender Vote: nur aura setzen, sus nicht anfassen.
            update: { aura: true },
          });
          await recalcTrackVoteStats(tx, like.trackId);
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: { imported: importable.length, skipped },
    });
  } catch (error) {
    console.error('Like-Import error:', error);
    return NextResponse.json(
      { success: false, error: 'Error importing likes.' },
      { status: 500 }
    );
  }
}
