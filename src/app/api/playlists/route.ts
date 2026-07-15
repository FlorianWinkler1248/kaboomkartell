/**
 * Playlists API Route
 *
 * GET  /api/playlists - Aktive Playlists auflisten (öffentlich)
 * POST /api/playlists - Neue Playlist erstellen (nur Admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { slugify } from '@/lib/utils';
import { PLAYLIST_TYPES } from '@/lib/constants';

/**
 * GET /api/playlists
 * Gibt alle aktiven Playlists mit Track-Count zurück.
 * Admin sieht auch inaktive Playlists.
 */
export async function GET() {
  try {
    const session = await auth();
    const isAdmin = session?.user?.role === 'ADMIN';

    const where = isAdmin ? {} : { isActive: true };

    const playlists = await prisma.playlist.findMany({
      where,
      include: {
        tracks: {
          include: {
            track: {
              select: { coverUrl: true },
            },
          },
          orderBy: { position: 'asc' },
          take: 4, // Für Cover-Preview (erste 4 Tracks)
        },
        _count: {
          select: { tracks: true },
        },
      },
      orderBy: [
        { isFeatured: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    const data = playlists.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      coverUrl: p.coverUrl,
      type: p.type,
      genre: p.genre,
      isFeatured: p.isFeatured,
      trackCount: p._count.tracks,
      // Cover-Vorschau: Erste 4 Track-Cover
      previewCovers: p.tracks
        .map((pt) => pt.track.coverUrl)
        .filter(Boolean),
      // Admin-Only Felder
      ...(isAdmin ? {
        bpmMin: p.bpmMin,
        bpmMax: p.bpmMax,
        rotationDays: p.rotationDays,
        maxTracks: p.maxTracks,
        isActive: p.isActive,
        lastRotatedAt: p.lastRotatedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      } : {}),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Playlist list error:', error);
    return NextResponse.json(
      { success: false, error: 'Error loading playlists.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/playlists
 * Erstellt eine neue Playlist.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, coverUrl, type, genre, bpmMin, bpmMax, rotationDays, maxTracks, isFeatured } = body;

    if (!name || !type) {
      return NextResponse.json(
        { success: false, error: 'Name and type are required.' },
        { status: 400 }
      );
    }

    // Playlist-Typ validieren
    const validTypes = Object.values(PLAYLIST_TYPES) as string[];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // BPM-Range validieren
    const parsedBpmMin = bpmMin ? parseInt(bpmMin) : null;
    const parsedBpmMax = bpmMax ? parseInt(bpmMax) : null;
    if (parsedBpmMin !== null && parsedBpmMax !== null && parsedBpmMin > parsedBpmMax) {
      return NextResponse.json(
        { success: false, error: 'bpmMin must be less than or equal to bpmMax.' },
        { status: 400 }
      );
    }

    // maxTracks validieren
    const parsedMaxTracks = maxTracks ? parseInt(maxTracks) : 15;
    if (parsedMaxTracks <= 0) {
      return NextResponse.json(
        { success: false, error: 'maxTracks must be greater than 0.' },
        { status: 400 }
      );
    }

    // Slug generieren
    let slug = slugify(name);
    const existing = await prisma.playlist.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const playlist = await prisma.playlist.create({
      data: {
        name,
        slug,
        description: description || null,
        coverUrl: coverUrl || null,
        type,
        genre: genre || null,
        bpmMin: parsedBpmMin,
        bpmMax: parsedBpmMax,
        rotationDays: rotationDays ? parseInt(rotationDays) : null,
        maxTracks: parsedMaxTracks,
        isFeatured: isFeatured || false,
      },
    });

    return NextResponse.json(
      { success: true, message: 'Playlist created.', data: playlist },
      { status: 201 }
    );
  } catch (error) {
    console.error('Playlist creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Error creating playlist.' },
      { status: 500 }
    );
  }
}
