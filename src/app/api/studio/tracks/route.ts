/**
 * Studio-Tracks API (ADR-041)
 *
 * GET  /api/studio/tracks — eigene Tracks inkl. Submission-Status
 * POST /api/studio/tracks — Track-Einreichung: IMMER isPublic=false +
 *   UploadSubmission(PENDING), KEIN attachTrackToPool. Publish geht
 *   ausschließlich über Flows Review (/api/admin/submissions).
 *
 * Gate: requireStudio + requireUploadRight (Badge artist:upload UND T2).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireStudio } from '@/lib/studio-api';
import { requireUploadRight, PermissionError } from '@/lib/permissions';
import { createStudioTrackSchema } from '@/lib/validations';
import { slugify } from '@/lib/utils';
import { fileExists, getAbsolutePath } from '@/lib/storage';
import { tryGetMp3Duration } from '@/lib/mp3-duration';
import { studioSubmitLimit } from '@/lib/rate-limit';

export async function GET() {
  const { profile, error } = await requireStudio();
  if (error) return error;

  try {
    const tracks = await prisma.track.findMany({
      where: { artistProfileId: profile.id },
      include: { uploadSubmission: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        tracks: tracks.map((t) => ({
          id: t.id,
          title: t.title,
          slug: t.slug,
          trackType: t.trackType,
          duration: t.duration,
          coverUrl: t.coverUrl,
          genre: t.genre,
          bpm: t.bpm,
          isPublic: t.isPublic,
          aiDisclosure: t.aiDisclosure,
          isrc: t.isrc,
          label: t.label,
          description: t.description,
          playCount: t.playCount,
          auraCount: t.auraCount,
          submission: t.uploadSubmission
            ? {
                status: t.uploadSubmission.status,
                reviewNote: t.uploadSubmission.reviewNote,
                message: t.uploadSubmission.message,
                updatedAt: t.uploadSubmission.updatedAt,
              }
            : null,
        })),
      },
    });
  } catch (err) {
    console.error('Studio tracks GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Error loading your tracks.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { session, profile, error } = await requireStudio();
  if (error) return error;

  try {
    await requireUploadRight(session.user.id);
  } catch (e) {
    if (e instanceof PermissionError) {
      return NextResponse.json(
        { success: false, error: 'Uploads need the artist:upload badge and 2FA (T2). Ask Flow.' },
        { status: 403 }
      );
    }
    throw e;
  }

  if (!studioSubmitLimit.check(`studio-submit:${session.user.id}`, 6).success) {
    return NextResponse.json(
      { success: false, error: 'Too many submissions. Try again later.' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const result = createStudioTrackSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const d = result.data;

    // Datei muss real aus dem Upload-System stammen (Regex im Schema + Existenz).
    if (!fileExists(d.filePath)) {
      return NextResponse.json(
        { success: false, error: 'Uploaded file not found. Upload the MP3 first.' },
        { status: 400 }
      );
    }

    // Slug einzigartig machen (Muster /api/tracks POST).
    let slug = slugify(d.title);
    const existingSlug = await prisma.track.findUnique({ where: { slug } });
    if (existingSlug) slug = `${slug}-${Date.now().toString(36)}`;

    // Dauer serverseitig aus der echten MP3 (Conductor-Zeitlinie braucht die
    // reale Länge — Muster /api/tracks POST, Radio Sync v2).
    const duration = tryGetMp3Duration(getAbsolutePath(d.filePath)) ?? 0;

    const emptyToNull = (v: string | undefined) =>
      v === undefined || v.trim() === '' ? null : v;

    const { track, submission } = await prisma.$transaction(async (tx) => {
      const track = await tx.track.create({
        data: {
          title: d.title,
          slug,
          trackType: 'LOCAL',
          fileName: d.fileName,
          filePath: d.filePath,
          fileSize: Math.round(d.fileSize),
          duration,
          coverUrl: emptyToNull(d.coverUrl),
          genre: d.genre,
          bpm: d.bpm ?? null,
          description: emptyToNull(d.description),
          aiDisclosure: d.aiDisclosure,
          aiSource: d.aiDisclosure === 'human' ? null : emptyToNull(d.aiSource),
          isrc: emptyToNull(d.isrc),
          label: emptyToNull(d.label),
          // Review-Invariante: Studio-Tracks starten IMMER unveröffentlicht
          // und ohne Pool-Attach — mapPoolTracks kann sie nie sehen.
          isPublic: false,
          status: 'DRAFT',
          artistId: session.user.id,
          uploaderId: session.user.id,
          artistProfileId: profile.id,
        },
      });
      const submission = await tx.uploadSubmission.create({
        data: {
          trackId: track.id,
          submitterId: session.user.id,
          status: 'PENDING',
          message: emptyToNull(d.message),
        },
      });
      return { track, submission };
    });

    return NextResponse.json(
      { success: true, message: 'Submitted for review.', data: { track, submission } },
      { status: 201 }
    );
  } catch (err) {
    console.error('Studio track POST error:', err);
    return NextResponse.json(
      { success: false, error: 'Error submitting track.' },
      { status: 500 }
    );
  }
}
