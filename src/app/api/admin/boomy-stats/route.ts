/**
 * Admin Boomy-Pool Stats API
 *
 * GET /api/admin/boomy-stats
 *   Liefert den Status von Boomys Release-Queue (wartende KI-Tracks)
 *   plus Release-Indikatoren (Schwelle, hasReleaseCandidate).
 *
 * Auth: Admin-Session (role=ADMIN). KEIN Boomy-Secret — diese Route
 * ist für die Admin-UI gedacht. Boomy selbst nutzt GET /api/boomy/auto-publish.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';
import { BOOMY_CONFIG } from '@/lib/constants';
import { getReleaseQueueStats } from '@/lib/boomy';

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

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
  } catch (error) {
    return adminErrorResponse(error, 'Admin boomy-stats error:');
  }
}
