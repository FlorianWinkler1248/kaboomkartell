/**
 * Boomy Wall-Post API
 *
 * POST /api/boomy/wall-post
 *   { content: string, type?: "SHOUTOUT" | "MESSAGE" | "WELCOME" }
 *
 * Schreibt einen Wall-Post als Boomy. Auth via BOOMY_AUTO_PUBLISH_SECRET-Header
 * (gleicher Secret wie auto-publish — Boomy ist eine Identität nach außen).
 *
 * Für Inspirational Quotes, Hype-Posts (externe Uploads), oder ad-hoc Custom-Posts
 * von Boomy. Release-Posts laufen automatisch durch /api/boomy/auto-publish.
 *
 * Hard rule: Inhalt MUSS Englisch sein. Wir validieren das nicht hart, aber die
 * Persona im externen Boomy-Dienst erinnert daran. Max 500 Zeichen (KBK-Convention).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { BOOMY_CONFIG, BOOMY_PURPLE, validateBoomySecret } from '@/lib/constants';
import { applyRateLimit, boomyLimit } from '@/lib/rate-limit';
import { postToDiscord, hexToDiscordColor } from '@/lib/discord-webhook';

const schema = z.object({
  content: z.string().min(1).max(500),
  type: z.enum(['SHOUTOUT', 'MESSAGE', 'WELCOME']).default('SHOUTOUT'),
});

export async function POST(request: NextRequest) {
  // Rate-Limit als Defense-in-Depth zum Secret
  const limited = applyRateLimit(request, boomyLimit, 'boomy-wall', 60);
  if (limited) return limited;

  try {
    if (!validateBoomySecret(request.headers.get('Authorization'))) {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const boomy = await prisma.user.findUnique({
      where: { username: BOOMY_CONFIG.username },
      select: { id: true },
    });

    if (!boomy) {
      return NextResponse.json(
        { success: false, error: 'Boomy user not seeded.' },
        { status: 500 }
      );
    }

    const post = await prisma.wallPost.create({
      data: {
        content: parsed.data.content,
        type: parsed.data.type,
        authorId: boomy.id,
      },
    });

    // ADR-005 D: Boomy-Wall-Posts in den Discord-#radio-feed spiegeln.
    // postToDiscord wirft nie — ein Webhook-Fehler darf den Wall-Post nicht kippen.
    await postToDiscord({
      username: 'Boomy',
      embeds: [
        {
          description: post.content,
          color: hexToDiscordColor(BOOMY_PURPLE),
          footer: { text: 'KBK Wall' },
          timestamp: post.createdAt.toISOString(),
        },
      ],
    });

    return NextResponse.json({
      success: true,
      data: {
        id: post.id,
        content: post.content,
        type: post.type,
        createdAt: post.createdAt,
      },
    });
  } catch (error) {
    console.error('Boomy wall-post error:', error);
    return NextResponse.json(
      { success: false, error: 'Error posting to wall.' },
      { status: 500 }
    );
  }
}
