/**
 * Boomy Track-Cover Replace API
 *
 * PUT /api/boomy/track/[trackId]/cover
 *   Ersetzt das Cover eines bestehenden Tracks. Wird vom externen Boomy-Agenten
 *   nach der Cover-Generierung + /api/boomy/upload-cover aufgerufen, um den
 *   neu generierten Sprite an den Track zu binden.
 *
 *   Body: { coverUrl: "https://..." } — KBK-relative oder absolute URL.
 *   Response: 200 + { success: true, data: { trackId, coverUrl } }
 *             404 wenn Track nicht existiert
 *             400 bei ungueltigem Body
 *
 * Auth: Authorization-Header == BOOMY_CONFIG.autoPublishSecret.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { validateBoomySecret } from '@/lib/constants';
import { applyRateLimit, boomyLimit } from '@/lib/rate-limit';

const BodySchema = z.object({
  coverUrl: z.string().trim().min(1).max(2048),
});

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ trackId: string }> }
) {
  const limited = applyRateLimit(request, boomyLimit, 'boomy-cover-replace', 60);
  if (limited) return limited;

  if (!validateBoomySecret(request.headers.get('Authorization'))) {
    return NextResponse.json(
      { success: false, error: 'Not authorized.' },
      { status: 403 }
    );
  }

  const { trackId } = await context.params;
  if (!trackId || trackId.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: 'Missing trackId.' },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid body: coverUrl required (string, 1-2048 chars).' },
      { status: 400 }
    );
  }

  const existing = await prisma.track.findUnique({
    where: { id: trackId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: 'Track not found.' },
      { status: 404 }
    );
  }

  const updated = await prisma.track.update({
    where: { id: trackId },
    data: { coverUrl: parsed.data.coverUrl },
    select: { id: true, coverUrl: true },
  });

  return NextResponse.json({
    success: true,
    data: { trackId: updated.id, coverUrl: updated.coverUrl },
  });
}
