/**
 * Admin: einzelnes Artist-Profil (ADR-041)
 *
 * GET    — Detail inkl. Tracks
 * PUT    — alle Felder inkl. name/slug/isPublished/sortOrder
 * DELETE — nur solange unclaimed (geclaimte Profile gehören dem Künstler;
 *          Trennung wäre ein bewusster Admin-Schritt via PUT userId? → v2)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';
import { adminArtistProfileUpdateSchema } from '@/lib/validations';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const profile = await prisma.artistProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, email: true } },
        tracks: {
          select: {
            id: true,
            title: true,
            trackType: true,
            isPublic: true,
            uploadSubmission: { select: { status: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!profile) {
      return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: profile });
  } catch (err) {
    return adminErrorResponse(err, 'Admin artist-profile GET error:');
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const body = await request.json();
    const result = adminArtistProfileUpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const d = result.data;

    // Slug-Wechsel: Kollisionen prüfen (User.username + andere Profile).
    if (d.slug) {
      const userCollision = await prisma.user.findUnique({ where: { username: d.slug } });
      if (userCollision) {
        return NextResponse.json(
          { success: false, error: 'Slug collides with an existing username.' },
          { status: 409 }
        );
      }
    }

    const emptyToNull = (v: string | undefined) =>
      v === undefined ? undefined : v.trim() === '' ? null : v;

    const profile = await prisma.artistProfile.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.slug !== undefined ? { slug: d.slug } : {}),
        ...(d.bio !== undefined ? { bio: emptyToNull(d.bio) } : {}),
        ...(d.avatarUrl !== undefined ? { avatarUrl: emptyToNull(d.avatarUrl) } : {}),
        ...(d.headerUrl !== undefined ? { headerUrl: emptyToNull(d.headerUrl) } : {}),
        ...(d.socialSoundcloud !== undefined
          ? { socialSoundcloud: emptyToNull(d.socialSoundcloud) }
          : {}),
        ...(d.socialInstagram !== undefined
          ? { socialInstagram: emptyToNull(d.socialInstagram) }
          : {}),
        ...(d.socialTelegram !== undefined
          ? { socialTelegram: emptyToNull(d.socialTelegram) }
          : {}),
        ...(d.socialWebsite !== undefined
          ? { socialWebsite: emptyToNull(d.socialWebsite) }
          : {}),
        ...(d.isPublished !== undefined ? { isPublished: d.isPublished } : {}),
        ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
      },
    });

    return NextResponse.json({ success: true, data: profile });
  } catch (err) {
    return adminErrorResponse(err, 'Admin artist-profile PUT error:');
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const profile = await prisma.artistProfile.findUnique({
      where: { id },
      select: { userId: true, _count: { select: { tracks: true } } },
    });
    if (!profile) {
      return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
    }
    if (profile.userId) {
      return NextResponse.json(
        { success: false, error: 'Claimed profiles cannot be deleted.' },
        { status: 409 }
      );
    }
    if (profile._count.tracks > 0) {
      return NextResponse.json(
        { success: false, error: 'Profile still has tracks. Reassign or remove them first.' },
        { status: 409 }
      );
    }

    await prisma.artistProfile.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Profile deleted.' });
  } catch (err) {
    return adminErrorResponse(err, 'Admin artist-profile DELETE error:');
  }
}
