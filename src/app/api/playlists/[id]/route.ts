/**
 * Einzelne Playlist API
 *
 * GET    /api/playlists/[id] - Playlist mit allen Tracks laden (Suche per Slug oder ID)
 * PUT    /api/playlists/[id] - Playlist bearbeiten (nur Admin)
 * DELETE /api/playlists/[id] - Playlist deaktivieren (Soft-Delete, nur Admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { PLAYLIST_TYPES } from '@/lib/constants';

// Gemeinsamer Include-Block für Playlist-Tracks (DRY)
const playlistWithTracks = {
  tracks: {
    include: {
      track: {
        include: {
          artist: {
            select: { id: true, username: true, displayName: true },
          },
          featuringArtist: {
            select: { id: true, username: true, displayName: true },
          },
        },
      },
    },
    orderBy: { position: 'asc' as const },
  },
};

/**
 * GET /api/playlists/[id]
 * Lädt eine Playlist mit allen Tracks. Sucht per Slug oder ID (ein Query).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Ein Query statt zwei: Suche per Slug ODER ID
    const playlist = await prisma.playlist.findFirst({
      where: { OR: [{ slug: id }, { id }] },
      include: playlistWithTracks,
    });

    if (!playlist) {
      return NextResponse.json(
        { success: false, error: 'Playlist not found.' },
        { status: 404 }
      );
    }

    // Nur aktive Playlists für nicht-Admins
    const session = await auth();
    const isAdmin = session?.user?.role === 'ADMIN';
    if (!playlist.isActive && !isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Playlist not found.' },
        { status: 404 }
      );
    }

    // Nur öffentliche Tracks für nicht-Admins
    const tracks = playlist.tracks
      .filter((pt) => isAdmin || pt.track.isPublic)
      .map((pt) => ({
        id: pt.track.id,
        title: pt.track.title,
        slug: pt.track.slug,
        trackType: pt.track.trackType,
        duration: pt.track.duration,
        coverUrl: pt.track.coverUrl,
        genre: pt.track.genre,
        bpm: pt.track.bpm,
        playCount: pt.track.playCount,
        aiDisclosure: pt.track.aiDisclosure,
        aiSource: pt.track.aiSource,
        auraCount: pt.track.auraCount,
        susCount: pt.track.susCount,
        totalVotes: pt.track.totalVotes,
        susPercentage: pt.track.susPercentage,
        artist: pt.track.artist,
        featuringArtist: pt.track.featuringArtist,
        streamUrl: pt.track.trackType === 'LOCAL' ? `/api/tracks/${pt.track.id}/stream` : '',
        soundcloudUrl: pt.track.trackType === 'SOUNDCLOUD' ? pt.track.soundcloudUrl : undefined,
        soundcloudEmbedUrl: pt.track.trackType === 'SOUNDCLOUD' ? pt.track.soundcloudEmbedUrl : undefined,
        soundcloudArtwork: pt.track.trackType === 'SOUNDCLOUD' ? pt.track.soundcloudArtwork : undefined,
        position: pt.position,
      }));

    return NextResponse.json({
      success: true,
      data: {
        id: playlist.id,
        name: playlist.name,
        slug: playlist.slug,
        description: playlist.description,
        coverUrl: playlist.coverUrl,
        type: playlist.type,
        genre: playlist.genre,
        isFeatured: playlist.isFeatured,
        trackCount: tracks.length,
        tracks,
        ...(isAdmin ? {
          bpmMin: playlist.bpmMin,
          bpmMax: playlist.bpmMax,
          rotationDays: playlist.rotationDays,
          maxTracks: playlist.maxTracks,
          isActive: playlist.isActive,
          lastRotatedAt: playlist.lastRotatedAt,
          createdAt: playlist.createdAt,
          updatedAt: playlist.updatedAt,
        } : {}),
      },
    });
  } catch (error) {
    console.error('Playlist detail error:', error);
    return NextResponse.json(
      { success: false, error: 'Error loading playlist.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/playlists/[id]
 * Playlist bearbeiten (nur Admin).
 * Validiert: BPM-Range, maxTracks > 0, gültiger Playlist-Typ.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Validierung: Playlist-Typ muss gültig sein
    const validTypes = Object.values(PLAYLIST_TYPES) as string[];
    if (body.type !== undefined && !validTypes.includes(body.type)) {
      return NextResponse.json(
        { success: false, error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validierung: BPM-Range
    const bpmMin = body.bpmMin !== undefined ? (body.bpmMin ? parseInt(body.bpmMin) : null) : undefined;
    const bpmMax = body.bpmMax !== undefined ? (body.bpmMax ? parseInt(body.bpmMax) : null) : undefined;
    if (bpmMin !== undefined && bpmMax !== undefined && bpmMin !== null && bpmMax !== null && bpmMin > bpmMax) {
      return NextResponse.json(
        { success: false, error: 'bpmMin must be less than or equal to bpmMax.' },
        { status: 400 }
      );
    }

    // Validierung: maxTracks > 0
    if (body.maxTracks !== undefined && parseInt(body.maxTracks) <= 0) {
      return NextResponse.json(
        { success: false, error: 'maxTracks must be greater than 0.' },
        { status: 400 }
      );
    }

    const playlist = await prisma.playlist.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.coverUrl !== undefined && { coverUrl: body.coverUrl }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.genre !== undefined && { genre: body.genre }),
        ...(bpmMin !== undefined && { bpmMin }),
        ...(bpmMax !== undefined && { bpmMax }),
        ...(body.rotationDays !== undefined && { rotationDays: body.rotationDays ? parseInt(body.rotationDays) : null }),
        ...(body.maxTracks !== undefined && { maxTracks: parseInt(body.maxTracks) }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.isFeatured !== undefined && { isFeatured: body.isFeatured }),
      },
    });

    return NextResponse.json({ success: true, data: playlist });
  } catch (error) {
    console.error('Playlist update error:', error);
    return NextResponse.json(
      { success: false, error: 'Error updating playlist.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/playlists/[id]
 * Soft-Delete: Setzt isActive auf false (konsistent mit Track-Archivierung).
 * Playlist und Tracks bleiben erhalten, werden aber nicht mehr angezeigt.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    await prisma.playlist.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: 'Playlist deactivated.' });
  } catch (error) {
    console.error('Playlist delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Error deleting playlist.' },
      { status: 500 }
    );
  }
}
