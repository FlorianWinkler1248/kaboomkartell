/**
 * Admin: Invite-Token für ein Artist-Profil (ADR-041)
 *
 * POST /api/admin/artist-profiles/[id]/invite — erzeugt einen Claim-Token.
 * Der Klartext wird GENAU EINMAL in der Response gezeigt (Muster ApiToken);
 * die DB hält nur den SHA-256-Hash. Ein neuer Invite ersetzt den alten.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';
import { inviteCreateSchema } from '@/lib/validations';
import { generateClaimToken } from '@/lib/artist-claim';
import { getClientIp } from '@/lib/rate-limit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // leerer Body ist ok (Default 14 Tage)
    }
    const result = inviteCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const profile = await prisma.artistProfile.findUnique({
      where: { id },
      select: { id: true, slug: true, userId: true },
    });
    if (!profile) {
      return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
    }
    if (profile.userId) {
      return NextResponse.json(
        { success: false, error: 'Profile is already claimed — no invite needed.' },
        { status: 409 }
      );
    }

    const { token, tokenHash } = generateClaimToken();
    const expiresAt = new Date(Date.now() + result.data.expiresInDays * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.artistProfile.update({
        where: { id: profile.id },
        data: { claimTokenHash: tokenHash, claimTokenExpiry: expiresAt },
      });
      await tx.securityEvent.create({
        data: {
          userId: session.user.id,
          eventType: 'artist_invite_created',
          ip: getClientIp(request),
          metadata: JSON.stringify({
            profileId: profile.id,
            slug: profile.slug,
            expiresAt: expiresAt.toISOString(),
          }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Invite created. The token is shown ONCE — copy it now.',
      data: {
        token,
        claimPath: `/claim/${token}`,
        expiresAt,
      },
    });
  } catch (err) {
    return adminErrorResponse(err, 'Admin artist-invite POST error:');
  }
}
