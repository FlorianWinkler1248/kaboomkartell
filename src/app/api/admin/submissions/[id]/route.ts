/**
 * Admin: Review-Entscheidung (ADR-041)
 *
 * POST /api/admin/submissions/[id] — APPROVE | REJECT | REQUEST_CHANGES.
 * APPROVE + publish:true = die EINZIGE Route, über die ein Studio-Track
 * isPublic=true bekommt (+ attachTrackToPool bei KBK-Genre + LOCAL).
 * Übergangs-Matrix: lib/submission.ts (pure, getestet).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';
import { submissionReviewSchema } from '@/lib/validations';
import { reviewTransition } from '@/lib/submission';
import { attachTrackToPool } from '@/lib/boomy';
import { isGenre, genrePoolSlug } from '@/lib/constants';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const body = await request.json();
    const result = submissionReviewSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { action, note, publish } = result.data;

    const submission = await prisma.uploadSubmission.findUnique({
      where: { id },
      include: { track: true },
    });
    if (!submission) {
      return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
    }

    const nextStatus = reviewTransition(submission.status, action);
    if (!nextStatus) {
      return NextResponse.json(
        {
          success: false,
          error: `Action ${action} is not allowed from status ${submission.status}.`,
        },
        { status: 409 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedSubmission = await tx.uploadSubmission.update({
        where: { id: submission.id },
        data: {
          status: nextStatus,
          reviewNote: note?.trim() ? note : null,
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
        },
      });

      // Publish nur bei APPROVE + explizitem publish-Flag.
      if (action === 'APPROVE' && publish === true) {
        await tx.track.update({
          where: { id: submission.trackId },
          data: { isPublic: true, publishedAt: new Date() },
        });
      }

      return updatedSubmission;
    });

    // Pool-Attach außerhalb der Transaktion (attachTrackToPool nutzt den
    // globalen Client — Muster /api/tracks POST). Nur LOCAL + KBK-Genre.
    if (
      action === 'APPROVE' &&
      publish === true &&
      submission.track.trackType === 'LOCAL' &&
      isGenre(submission.track.genre)
    ) {
      await attachTrackToPool(submission.trackId, genrePoolSlug(submission.track.genre));
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    return adminErrorResponse(err, 'Admin submission review error:');
  }
}
