/**
 * Studio-Track-Edit API (ADR-041)
 *
 * PUT /api/studio/tracks/[id] — eigenen eingereichten Track nachbearbeiten.
 * Nur solange die Submission PENDING oder CHANGES_REQUESTED ist; ein Edit
 * nach CHANGES_REQUESTED gilt als Re-Submit und setzt zurück auf PENDING.
 * BEWUSST eigenes Schema ohne isPublic/status — kein Review-Bypass möglich.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireStudio } from '@/lib/studio-api';
import { updateStudioTrackSchema } from '@/lib/validations';
import { isEditableByArtist, SUBMISSION_STATUS } from '@/lib/submission';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { profile, error } = await requireStudio();
  if (error) return error;

  try {
    const { id } = await params;
    // Ownership: der Track muss zum eigenen Profil gehören.
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
    if (!track.uploadSubmission) {
      return NextResponse.json(
        { success: false, error: 'This track has no submission and is managed by Flow.' },
        { status: 403 }
      );
    }
    if (!isEditableByArtist(track.uploadSubmission.status)) {
      return NextResponse.json(
        { success: false, error: 'Locked after review. Contact Flow for changes.' },
        { status: 409 }
      );
    }

    const body = await request.json();
    const result = updateStudioTrackSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const d = result.data;
    const emptyToNull = (v: string | undefined) =>
      v === undefined ? undefined : v.trim() === '' ? null : v;

    const wasChangesRequested =
      track.uploadSubmission.status === SUBMISSION_STATUS.CHANGES_REQUESTED;

    const updated = await prisma.$transaction(async (tx) => {
      const updatedTrack = await tx.track.update({
        where: { id: track.id },
        data: {
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.genre !== undefined ? { genre: d.genre } : {}),
          ...(d.bpm !== undefined ? { bpm: d.bpm } : {}),
          ...(d.description !== undefined ? { description: emptyToNull(d.description) } : {}),
          ...(d.isrc !== undefined ? { isrc: emptyToNull(d.isrc) } : {}),
          ...(d.label !== undefined ? { label: emptyToNull(d.label) } : {}),
          ...(d.coverUrl !== undefined ? { coverUrl: emptyToNull(d.coverUrl) } : {}),
        },
      });
      const updatedSubmission = await tx.uploadSubmission.update({
        where: { trackId: track.id },
        data: {
          ...(d.message !== undefined ? { message: emptyToNull(d.message) } : {}),
          // Re-Submit: nach Flows CHANGES_REQUESTED zurück in die Queue.
          ...(wasChangesRequested ? { status: SUBMISSION_STATUS.PENDING } : {}),
        },
      });
      return { track: updatedTrack, submission: updatedSubmission };
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('Studio track PUT error:', err);
    return NextResponse.json(
      { success: false, error: 'Error updating track.' },
      { status: 500 }
    );
  }
}
