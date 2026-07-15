/**
 * Boomy AI-Tracks API
 *
 * GET /api/boomy/ai-tracks
 *   Listet alle Tracks mit AI-Bezug für die Cover-Replace-Pipeline.
 *
 *   Mapping (kein eigenes aiTag-Feld nötig — wird aus existierenden Feldern abgeleitet):
 *     - tag = 'ai-only'    → aiDisclosure='ai_generated' (z.B. reine Boomy-Tracks)
 *     - tag = 'ai-feature' → aiDisclosure='ai_assisted'  (z.B. 4Flow feat. Boomy / Hardphonk)
 *
 *   Tracks ohne AI-Bezug (aiDisclosure='human' oder NULL) werden nicht zurückgegeben.
 *
 *   Response: { success: true, data: [{ trackId, title, genre, tag, currentCoverUrl }] }
 *
 * Auth: Authorization-Header == BOOMY_CONFIG.autoPublishSecret.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { AI_DISCLOSURE, validateBoomySecret } from '@/lib/constants';
import { applyRateLimit, boomyLimit } from '@/lib/rate-limit';

type AiTag = 'ai-only' | 'ai-feature';

function mapAiTag(aiDisclosure: string | null): AiTag | null {
  if (aiDisclosure === AI_DISCLOSURE.AI_GENERATED) return 'ai-only';
  if (aiDisclosure === AI_DISCLOSURE.AI_ASSISTED) return 'ai-feature';
  return null;
}

export async function GET(request: NextRequest) {
  const limited = applyRateLimit(request, boomyLimit, 'boomy-ai-tracks', 60);
  if (limited) return limited;

  if (!validateBoomySecret(request.headers.get('Authorization'))) {
    return NextResponse.json(
      { success: false, error: 'Not authorized.' },
      { status: 403 }
    );
  }

  const tracks = await prisma.track.findMany({
    where: {
      aiDisclosure: {
        in: [AI_DISCLOSURE.AI_GENERATED, AI_DISCLOSURE.AI_ASSISTED],
      },
    },
    select: {
      id: true,
      title: true,
      genre: true,
      coverUrl: true,
      aiDisclosure: true,
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  const data = tracks
    .map((t) => {
      const tag = mapAiTag(t.aiDisclosure);
      if (!tag) return null;
      return {
        trackId: t.id,
        title: t.title,
        genre: t.genre,
        tag,
        currentCoverUrl: t.coverUrl,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ success: true, data });
}
