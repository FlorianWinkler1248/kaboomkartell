/**
 * Play Count API Route
 *
 * POST /api/tracks/[id]/play - Increment play count
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { applyRateLimit, playLimit } from '@/lib/rate-limit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  // Rate-Limit: 30 Plays/min pro IP gegen Play-Counter-Inflation
  const limited = applyRateLimit(request, playLimit, 'play', 30);
  if (limited) return limited;

  try {
    const { id } = await params;

    const track = await prisma.track.findUnique({
      where: { id },
      select: { id: true, isPublic: true },
    });

    if (!track || !track.isPublic) {
      return NextResponse.json(
        { success: false, error: 'Track not found.' },
        { status: 404 }
      );
    }

    const updated = await prisma.track.update({
      where: { id },
      data: { playCount: { increment: 1 } },
      select: { playCount: true },
    });

    return NextResponse.json({
      success: true,
      playCount: updated.playCount,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to update play count.' },
      { status: 500 }
    );
  }
}
