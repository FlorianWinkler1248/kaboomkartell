/**
 * Studio-Profil API (ADR-041)
 *
 * GET /api/studio/profile — eigenes ArtistProfile lesen
 * PUT /api/studio/profile — Selbstverwaltung: bio/Bilder/Links.
 *   name + slug sind NICHT selbst editierbar (Kuratierungs-Hoheit bleibt
 *   bei Flow — Admin-Route).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireStudio } from '@/lib/studio-api';
import { studioProfileSchema } from '@/lib/validations';

function serializeProfile(profile: {
  slug: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  headerUrl: string | null;
  socialSoundcloud: string | null;
  socialInstagram: string | null;
  socialTelegram: string | null;
  socialWebsite: string | null;
  isPublished: boolean;
  claimedAt: Date | null;
}) {
  return {
    slug: profile.slug,
    name: profile.name,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    headerUrl: profile.headerUrl,
    socialSoundcloud: profile.socialSoundcloud,
    socialInstagram: profile.socialInstagram,
    socialTelegram: profile.socialTelegram,
    socialWebsite: profile.socialWebsite,
    isPublished: profile.isPublished,
    claimedAt: profile.claimedAt,
  };
}

export async function GET() {
  const { profile, error } = await requireStudio();
  if (error) return error;
  return NextResponse.json({ success: true, data: { profile: serializeProfile(profile) } });
}

export async function PUT(request: NextRequest) {
  const { profile, error } = await requireStudio();
  if (error) return error;

  try {
    const body = await request.json();
    const result = studioProfileSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Leere Strings aus Formularen → null (Feld löschen).
    const d = result.data;
    const toNull = (v: string | undefined) => (v === undefined ? undefined : v.trim() === '' ? null : v);

    const updated = await prisma.artistProfile.update({
      where: { id: profile.id },
      data: {
        bio: toNull(d.bio),
        avatarUrl: toNull(d.avatarUrl),
        headerUrl: toNull(d.headerUrl),
        socialSoundcloud: toNull(d.socialSoundcloud),
        socialInstagram: toNull(d.socialInstagram),
        socialTelegram: toNull(d.socialTelegram),
        socialWebsite: toNull(d.socialWebsite),
      },
    });

    return NextResponse.json({ success: true, data: { profile: serializeProfile(updated) } });
  } catch (err) {
    console.error('Studio profile PUT error:', err);
    return NextResponse.json(
      { success: false, error: 'Error updating profile.' },
      { status: 500 }
    );
  }
}
