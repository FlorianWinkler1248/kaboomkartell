/**
 * Vote API Route
 *
 * GET  /api/tracks/[id]/vote - Eigene Stimme für einen Track abrufen
 * POST /api/tracks/[id]/vote - Stimme abgeben oder aktualisieren
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { resolveActor, requireScope } from '@/lib/agent-auth';
import { PermissionError } from '@/lib/permissions';
import { createVoteSchema } from '@/lib/validations';
import { applyRateLimit, voteLimit } from '@/lib/rate-limit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tracks/[id]/vote - Eigene Stimme abrufen
 *
 * Gibt die Stimme des eingeloggten Users für diesen Track zurück,
 * oder null wenn noch nicht abgestimmt wurde.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Prüfen ob Track existiert
    const track = await prisma.track.findUnique({ where: { id } });
    if (!track) {
      return NextResponse.json(
        { success: false, error: 'Track not found.' },
        { status: 404 }
      );
    }

    // Eigene Stimme suchen
    const vote = await prisma.vote.findUnique({
      where: {
        userId_trackId: {
          userId: session.user.id,
          trackId: id,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: vote || null,
    });
  } catch (error) {
    console.error('Vote GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Error loading vote.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tracks/[id]/vote - Stimme abgeben oder aktualisieren
 *
 * Body: { aura: boolean, sus: boolean, listenedSeconds: number }
 * - listenedSeconds muss >= 60 sein (Mindestens 60 Sekunden gehört)
 * - Upsert: Wenn der User schon abgestimmt hat, wird aktualisiert
 * - Nach dem Upsert werden die aggregierten Werte am Track neu berechnet
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  // Outer Anti-Flood (vor Auth, IP-basiert) — großzügig, das echte Limit ist pro User.
  const limited = applyRateLimit(request, voteLimit, 'vote-ip', 60);
  if (limited) return limited;

  try {
    // Session (Mensch) ODER Bearer-PAT (Agent) — die eine Brücke (ADR-035 P2). Der
    // Tier-Check bleibt hier bewusst wie bisher (kein T1-Gate) — Bestands-Verhalten.
    const actor = await resolveActor(request);
    if (!actor) {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 401 }
      );
    }
    try {
      requireScope(actor, 'vote');
    } catch (e) {
      if (e instanceof PermissionError) {
        return NextResponse.json(
          { success: false, error: 'This token cannot vote (missing "vote" scope).' },
          { status: 403 }
        );
      }
      throw e;
    }
    // Pro-USER-Limit (geteilte Agenten-Egress-IP trifft sonst Unschuldige).
    if (!voteLimit.check(`vote-user:${actor.userId}`, 20).success) {
      return NextResponse.json({ success: false, error: 'Too many votes. Slow down.' }, { status: 429 });
    }

    const { id } = await params;
    const body = await request.json();

    // Validierung über Zod-Schema
    const result = createVoteSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // Prüfen ob Track existiert
    const track = await prisma.track.findUnique({ where: { id } });
    if (!track) {
      return NextResponse.json(
        { success: false, error: 'Track not found.' },
        { status: 404 }
      );
    }

    const { aura, sus, listenedSeconds } = result.data;

    // Transaktion für Konsistenz: Vote upserten + Track-Aggregation aktualisieren
    const updatedVote = await prisma.$transaction(async (tx) => {
      // Upsert: Erstellen oder aktualisieren
      const vote = await tx.vote.upsert({
        where: {
          userId_trackId: {
            userId: actor.userId,
            trackId: id,
          },
        },
        create: {
          userId: actor.userId,
          trackId: id,
          aura,
          sus,
          listenedSeconds,
        },
        update: {
          aura,
          sus,
          listenedSeconds,
        },
      });

      // Aggregierte Werte am Track neu berechnen
      // Boolean-Felder müssen separat gezählt werden (kein _sum für Boolean)
      const [totalVotes, auraVotes, susVotes] = await Promise.all([
        tx.vote.count({ where: { trackId: id } }),
        tx.vote.count({ where: { trackId: id, aura: true } }),
        tx.vote.count({ where: { trackId: id, sus: true } }),
      ]);

      const susPercentage = totalVotes > 0
        ? Math.round((susVotes / totalVotes) * 100)
        : 0;

      // Track-Aggregation aktualisieren
      await tx.track.update({
        where: { id },
        data: {
          auraCount: auraVotes,
          susCount: susVotes,
          totalVotes,
          susPercentage,
        },
      });

      return vote;
    });

    return NextResponse.json({
      success: true,
      message: 'Vote submitted.',
      data: updatedVote,
    });
  } catch (error) {
    console.error('Vote POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Error submitting vote.' },
      { status: 500 }
    );
  }
}
