/**
 * Boomy Peek-Release API
 *
 * POST /api/boomy/peek-release
 *   Wählt zufällig einen Release-Kandidaten aus den 3 KI-Source-Pools, gibt
 *   {trackId, title, genre, slug} zurück — OHNE Status zu ändern. Wird vom
 *   externen Boomy-Workflow genutzt: erst peek → dann Cover generieren →
 *   dann /auto-publish mit derselben trackId aufrufen (no race).
 *
 * Liefert 204 wenn alle KI-Pools leer sind.
 *
 * Auth: Authorization-Header == BOOMY_CONFIG.autoPublishSecret.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateBoomySecret } from '@/lib/constants';
import { pickReleaseCandidate } from '@/lib/boomy';
import { applyRateLimit, boomyLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // Rate-Limit als Defense-in-Depth zum Secret
  const limited = applyRateLimit(request, boomyLimit, 'boomy-peek', 60);
  if (limited) return limited;

  if (!validateBoomySecret(request.headers.get('Authorization'))) {
    return NextResponse.json(
      { success: false, error: 'Not authorized.' },
      { status: 403 }
    );
  }

  const candidate = await pickReleaseCandidate();
  if (!candidate) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({
    success: true,
    data: {
      trackId: candidate.trackId,
      title: candidate.title,
      genre: candidate.genre,
    },
  });
}
