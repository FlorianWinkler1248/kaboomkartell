/**
 * Track Detail API Route
 *
 * GET    /api/tracks/[id] - Track-Metadaten abrufen
 * PUT    /api/tracks/[id] - Track aktualisieren (nur Admin)
 * DELETE /api/tracks/[id] - Track archivieren (nur Admin, Soft-Delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { updateTrackSchema } from '@/lib/validations';
import { slugify } from '@/lib/utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tracks/[id] - Track-Metadaten
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const track = await prisma.track.findUnique({
      where: { id },
      include: {
        artist: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    if (!track) {
      return NextResponse.json(
        { success: false, error: 'Track not found.' },
        { status: 404 }
      );
    }

    // Nur öffentliche Tracks für nicht-Admins
    const session = await auth();
    const isAdmin = session?.user?.role === 'ADMIN';

    if (!track.isPublic && !isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Track not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...track,
        streamUrl: `/api/tracks/${track.id}/stream`,
      },
    });
  } catch (error) {
    console.error('Track detail error:', error);
    return NextResponse.json(
      { success: false, error: 'Error loading track.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tracks/[id] - Track aktualisieren
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    // Validierung
    const result = updateTrackSchema.safeParse(body);
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

    // Track prüfen
    const existing = await prisma.track.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Track not found.' },
        { status: 404 }
      );
    }

    // Slug aktualisieren wenn Titel sich ändert
    const updateData: Record<string, unknown> = { ...result.data };
    if (result.data.title && result.data.title !== existing.title) {
      let newSlug = slugify(result.data.title);
      const existingSlug = await prisma.track.findFirst({
        where: { slug: newSlug, id: { not: id } },
      });
      if (existingSlug) {
        newSlug = `${newSlug}-${Date.now().toString(36)}`;
      }
      updateData.slug = newSlug;
    }

    const track = await prisma.track.update({
      where: { id },
      data: updateData,
      include: {
        artist: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    // Verknüpften Release-Slot synchronisieren wenn der Track öffentlich wird
    if (result.data.isPublic === true) {
      const linkedSlot = await prisma.releaseSlot.findFirst({
        where: { trackId: id },
      });
      if (linkedSlot && linkedSlot.status !== 'PUBLISHED') {
        await prisma.releaseSlot.update({
          where: { id: linkedSlot.id },
          data: { status: 'PUBLISHED' },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Track updated.',
      data: {
        ...track,
        streamUrl: `/api/tracks/${track.id}/stream`,
      },
    });
  } catch (error) {
    console.error('Track update error:', error);
    return NextResponse.json(
      { success: false, error: 'Error updating track.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tracks/[id] - Track archivieren (Soft-Delete)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existing = await prisma.track.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Track not found.' },
        { status: 404 }
      );
    }

    // Soft-Delete: Status auf ARCHIVED + nicht mehr öffentlich (kein Airplay).
    await prisma.track.update({
      where: { id },
      data: { status: 'ARCHIVED', isPublic: false },
    });

    return NextResponse.json({
      success: true,
      message: 'Track archived.',
    });
  } catch (error) {
    console.error('Track delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Error archiving track.' },
      { status: 500 }
    );
  }
}
