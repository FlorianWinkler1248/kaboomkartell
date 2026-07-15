/**
 * Pool-Assign API
 *
 * POST /api/admin/pool-assign
 *   { trackId: string, poolSlug: string }
 *
 * Hängt einen Track an den Pool mit dem gegebenen Slug. Idempotent
 * (wenn Eintrag schon existiert, kein Fehler).
 *
 * Anders als /api/admin/pools/[id]/tracks akzeptiert dieser Endpoint
 * auch Tracks mit Status POOL (also unveröffentlicht) — denn Source-Pools
 * sammeln gerade die queued Tracks, nicht nur die publizierten.
 *
 * Auth: Admin-Session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';

const schema = z.object({
  trackId: z.string().min(1),
  poolSlug: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { trackId, poolSlug } = parsed.data;

    const pool = await prisma.pool.findUnique({ where: { slug: poolSlug } });
    if (!pool) {
      return NextResponse.json(
        { success: false, error: `Pool '${poolSlug}' not found.` },
        { status: 404 }
      );
    }

    const track = await prisma.track.findUnique({ where: { id: trackId } });
    if (!track) {
      return NextResponse.json(
        { success: false, error: 'Track not found.' },
        { status: 404 }
      );
    }

    // Idempotent: bestehende Verknüpfung ist OK
    const existing = await prisma.poolTrack.findUnique({
      where: { poolId_trackId: { poolId: pool.id, trackId } },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        data: { poolTrackId: existing.id, alreadyExisted: true },
      });
    }

    const poolTrack = await prisma.poolTrack.create({
      data: { poolId: pool.id, trackId },
    });

    return NextResponse.json({
      success: true,
      data: { poolTrackId: poolTrack.id, alreadyExisted: false },
    });
  } catch (error) {
    return adminErrorResponse(error, 'Pool-assign error:');
  }
}
