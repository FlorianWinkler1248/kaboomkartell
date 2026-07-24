import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';
import { generateCoverForTrack, masterHubConfigured } from '@/lib/cover-generator';

/**
 * POST /api/admin/cover-regenerate
 *
 * Lässt für alle öffentlichen Tracks ohne `coverUrl` ein Cover von einem
 * externen Generator-Dienst erzeugen und aktualisiert die Track-Records.
 *
 * Auth: Admin-Session erforderlich (Flow-only).
 *
 * Kernlogik (MASTER_HUB-Call, Akzent-Wahl, lokaler Mirror) lebt seit ADR-041
 * in src/lib/cover-generator.ts — geteilt mit der Studio-Sprite-Route.
 *
 * Response: { success: true, generated, failed, skipped, errors }
 */

export async function POST(request: NextRequest) {
  try {
    // 1. Admin-Auth
    const { error } = await requireAdmin();
    if (error) return error;

    if (!masterHubConfigured()) {
      return NextResponse.json(
        { success: false, error: 'MASTER_HUB_TOKEN is not configured.' },
        { status: 500 }
      );
    }

    // 2. Body (optional): { force?, limit?, poolName? }
    // poolName filtert auf Tracks die in einem bestimmten Pool sind (z.B.
    // "HARDPHONK SESSIONS"). Plus force=true regeneriert auch existing covers.
    let body: { force?: boolean; limit?: number; poolName?: string } = {};
    try {
      body = await request.json();
    } catch {
      // leer ist ok
    }
    const force = Boolean(body.force);
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 200) : 50;
    const poolName = typeof body.poolName === 'string' && body.poolName.trim().length > 0
      ? body.poolName.trim()
      : null;

    // 3. Kandidaten-Tracks laden
    const tracks = await prisma.track.findMany({
      where: {
        isPublic: true,
        ...(force ? {} : { coverUrl: null }),
        ...(poolName
          ? { poolTracks: { some: { pool: { name: poolName } } } }
          : {}),
      },
      include: {
        artist: { select: { displayName: true, username: true } },
      },
      take: limit,
    });

    if (tracks.length === 0) {
      return NextResponse.json({
        success: true,
        generated: 0,
        failed: 0,
        skipped: 0,
        message: 'No tracks without covers found.',
      });
    }

    const results = {
      generated: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ id: string; title: string; error: string }>,
    };

    // 4. Sequenziell (Rate-Limit freundlich, ~1-2s pro Cover)
    for (const track of tracks) {
      const artistName = track.artist.displayName || track.artist.username || 'UNKNOWN';
      const result = await generateCoverForTrack(track, artistName);
      if ('error' in result) {
        results.failed += 1;
        results.errors.push({ id: track.id, title: track.title, error: result.error });
        continue;
      }
      await prisma.track.update({
        where: { id: track.id },
        data: { coverUrl: result.url },
      });
      results.generated += 1;
    }

    return NextResponse.json({
      success: true,
      ...results,
      totalProcessed: tracks.length,
    });
  } catch (error) {
    return adminErrorResponse(error, 'Admin cover-regenerate error:');
  }
}

// GET gibt Status: wie viele Tracks ohne Cover sind da
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const withoutCover = await prisma.track.count({
      where: { isPublic: true, coverUrl: null },
    });
    const total = await prisma.track.count({ where: { isPublic: true } });

    return NextResponse.json({
      success: true,
      withoutCover,
      total,
      masterHubConfigured: masterHubConfigured(),
    });
  } catch (error) {
    return adminErrorResponse(error, 'Admin cover-regenerate status error:');
  }
}
