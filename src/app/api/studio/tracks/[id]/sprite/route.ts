/**
 * Studio-Sprite-Generierung (ADR-041)
 *
 * POST /api/studio/tracks/[id]/sprite — Cover beim MASTER_HUB erzeugen.
 * Teuer (~1–2s + Rechenzeit) → 5/h pro User + globaler Deckel 30/h.
 * Nur für eigene Tracks, solange die Submission editierbar ist (kein
 * Cover-Flip an publizierten Tracks vorbei an Flow).
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireStudio } from '@/lib/studio-api';
import { requireUploadRight, PermissionError } from '@/lib/permissions';
import { generateCoverForTrack, masterHubConfigured } from '@/lib/cover-generator';
import { isEditableByArtist } from '@/lib/submission';
import { spriteLimit } from '@/lib/rate-limit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { session, profile, error } = await requireStudio();
  if (error) return error;

  try {
    await requireUploadRight(session.user.id);
  } catch (e) {
    if (e instanceof PermissionError) {
      return NextResponse.json(
        { success: false, error: 'Sprite generation needs the artist:upload badge and 2FA (T2).' },
        { status: 403 }
      );
    }
    throw e;
  }

  if (!masterHubConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Cover service not configured.' },
      { status: 503 }
    );
  }

  // Kosten-Deckel: pro User UND global (mehrere Artists dürfen den Hub
  // nicht summiert fluten). In-Memory, Single-Instance — bewusster Trade-off.
  if (!spriteLimit.check(`sprite:${session.user.id}`, 5).success) {
    return NextResponse.json(
      { success: false, error: 'Sprite limit reached (5/hour). Try again later.' },
      { status: 429 }
    );
  }
  if (!spriteLimit.check('sprite:global', 30).success) {
    return NextResponse.json(
      { success: false, error: 'Cover service is busy. Try again later.' },
      { status: 429 }
    );
  }

  try {
    const { id } = await params;
    const track = await prisma.track.findFirst({
      where: { id, artistProfileId: profile.id },
      include: { uploadSubmission: true },
    });
    if (!track) {
      return NextResponse.json(
        { success: false, error: 'Track not found.' },
        { status: 404 }
      );
    }
    if (!track.uploadSubmission || !isEditableByArtist(track.uploadSubmission.status)) {
      return NextResponse.json(
        { success: false, error: 'Covers can only be generated while the track is in review.' },
        { status: 409 }
      );
    }

    const result = await generateCoverForTrack(track, profile.name);
    if ('error' in result) {
      return NextResponse.json(
        { success: false, error: `Cover generation failed: ${result.error}` },
        { status: 502 }
      );
    }

    await prisma.track.update({
      where: { id: track.id },
      data: { coverUrl: result.url },
    });

    return NextResponse.json({ success: true, data: { coverUrl: result.url } });
  } catch (err) {
    console.error('Studio sprite error:', err);
    return NextResponse.json(
      { success: false, error: 'Error generating cover.' },
      { status: 500 }
    );
  }
}
