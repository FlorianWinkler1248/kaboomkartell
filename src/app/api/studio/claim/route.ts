/**
 * Artist-Claim API (ADR-041)
 *
 * POST /api/studio/claim — Invite-Token einlösen: verknüpft das unclaimed
 * ArtistProfile mit dem eingeloggten Account, Rolle → KUENSTLER (nur aus
 * MITGLIED). Gate: T1 (Email verifiziert) — die Rolle im JWT zieht beim
 * nächsten Request nach (jwt-Callback liest die DB).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { requireTier, PermissionError } from '@/lib/permissions';
import { claimTokenSchema } from '@/lib/validations';
import { hashClaimToken, checkClaimState } from '@/lib/artist-claim';
import { applyRateLimit, claimLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const limited = applyRateLimit(request, claimLimit, 'claim', 5);
  if (limited) return limited;

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 401 }
      );
    }

    try {
      await requireTier(session.user.id, 'T1');
    } catch (e) {
      if (e instanceof PermissionError) {
        return NextResponse.json(
          { success: false, error: 'Verify your email first, then claim your spot.' },
          { status: 403 }
        );
      }
      throw e;
    }

    const body = await request.json();
    const result = claimTokenSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired invite.' },
        { status: 400 }
      );
    }

    const profile = await prisma.artistProfile.findUnique({
      where: { claimTokenHash: hashClaimToken(result.data.token) },
    });
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired invite.' },
        { status: 400 }
      );
    }
    const state = checkClaimState(profile);
    if (state === 'expired') {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired invite.' },
        { status: 400 }
      );
    }
    if (state === 'already_claimed') {
      return NextResponse.json(
        { success: false, error: 'This artist spot is already claimed.' },
        { status: 409 }
      );
    }

    // Ein Account = ein Profil (DB-unique auf userId; hier freundlicher Fehler).
    const existing = await prisma.artistProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Your account already has an artist profile.' },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.artistProfile.update({
        where: { id: profile.id },
        data: {
          userId: session.user.id,
          claimedAt: new Date(),
          claimTokenHash: null,
          claimTokenExpiry: null,
        },
      });
      // Rolle nur aus MITGLIED heben — HELFER/ADMIN bleiben unangetastet.
      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      });
      if (user?.role === 'MITGLIED') {
        await tx.user.update({
          where: { id: session.user.id },
          data: { role: 'KUENSTLER' },
        });
      }
      await tx.securityEvent.create({
        data: {
          userId: session.user.id,
          eventType: 'artist_claimed',
          ip: getClientIp(request),
          metadata: JSON.stringify({ profileId: profile.id, slug: profile.slug }),
        },
      });
    });

    return NextResponse.json({ success: true, data: { slug: profile.slug } });
  } catch (err) {
    console.error('Claim error:', err);
    return NextResponse.json(
      { success: false, error: 'Error claiming profile.' },
      { status: 500 }
    );
  }
}
