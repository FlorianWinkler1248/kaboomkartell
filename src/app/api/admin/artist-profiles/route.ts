/**
 * Admin: Artist-Profile (ADR-041)
 *
 * GET  /api/admin/artist-profiles — Liste inkl. Claim-Status + Track-Zahl
 * POST /api/admin/artist-profiles — Profil anlegen (auch unclaimed für den
 *   Outreach). Slug-Kollision wird gegen ArtistProfile.slug (DB-unique) UND
 *   User.username geprüft (code-seitig — /artists/[slug] vs. /profile/[u]).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';
import { adminArtistProfileSchema } from '@/lib/validations';
import { slugify } from '@/lib/utils';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const profiles = await prisma.artistProfile.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, username: true, email: true } },
        _count: { select: { tracks: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: profiles.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        bio: p.bio,
        avatarUrl: p.avatarUrl,
        headerUrl: p.headerUrl,
        socialSoundcloud: p.socialSoundcloud,
        socialInstagram: p.socialInstagram,
        socialTelegram: p.socialTelegram,
        socialWebsite: p.socialWebsite,
        isPublished: p.isPublished,
        sortOrder: p.sortOrder,
        claimed: Boolean(p.userId),
        claimedAt: p.claimedAt,
        claimedBy: p.user ? { username: p.user.username, email: p.user.email } : null,
        inviteActive: Boolean(p.claimTokenHash),
        inviteExpiresAt: p.claimTokenExpiry,
        trackCount: p._count.tracks,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    return adminErrorResponse(err, 'Admin artist-profiles GET error:');
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const result = adminArtistProfileSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const d = result.data;

    let slug = d.slug || slugify(d.name);
    // Kollision gegen User.username (Anzeige-Welten sauber trennen).
    const userCollision = await prisma.user.findUnique({ where: { username: slug } });
    if (userCollision) slug = `${slug}-artist`;
    const slugCollision = await prisma.artistProfile.findUnique({ where: { slug } });
    if (slugCollision) slug = `${slug}-${Date.now().toString(36)}`;

    const emptyToNull = (v: string | undefined) =>
      v === undefined || v.trim() === '' ? null : v;

    const profile = await prisma.artistProfile.create({
      data: {
        slug,
        name: d.name,
        bio: emptyToNull(d.bio),
        avatarUrl: emptyToNull(d.avatarUrl),
        headerUrl: emptyToNull(d.headerUrl),
        socialSoundcloud: emptyToNull(d.socialSoundcloud),
        socialInstagram: emptyToNull(d.socialInstagram),
        socialTelegram: emptyToNull(d.socialTelegram),
        socialWebsite: emptyToNull(d.socialWebsite),
        isPublished: d.isPublished ?? false,
        sortOrder: d.sortOrder ?? 0,
        createdBy: session.user.id,
      },
    });

    return NextResponse.json({ success: true, data: profile }, { status: 201 });
  } catch (err) {
    return adminErrorResponse(err, 'Admin artist-profiles POST error:');
  }
}
