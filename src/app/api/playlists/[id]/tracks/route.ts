/**
 * Playlist-Tracks API
 *
 * POST   /api/playlists/[id]/tracks - Track zur Playlist hinzufügen (Admin)
 * DELETE /api/playlists/[id]/tracks - Track aus Playlist entfernen (Admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';

/**
 * POST /api/playlists/[id]/tracks
 * Fügt einen Track zur Playlist hinzu.
 * Prüft: Admin-Auth, Playlist-Existenz, Track-Existenz, Kapazitätslimit.
 *
 * Body: { trackId: string }
 */
export async function POST(
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

    const { id: playlistId } = await params;
    const body = await request.json();
    const { trackId } = body;

    if (!trackId) {
      return NextResponse.json(
        { success: false, error: 'trackId is required.' },
        { status: 400 }
      );
    }

    // Playlist + aktuelle Track-Anzahl laden
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: { _count: { select: { tracks: true } } },
    });

    if (!playlist) {
      return NextResponse.json(
        { success: false, error: 'Playlist not found.' },
        { status: 404 }
      );
    }

    // Kapazitätsprüfung
    if (playlist._count.tracks >= playlist.maxTracks) {
      return NextResponse.json(
        { success: false, error: `Playlist is full (max ${playlist.maxTracks} tracks).` },
        { status: 409 }
      );
    }

    // Track-Existenz prüfen
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      select: { id: true, title: true },
    });

    if (!track) {
      return NextResponse.json(
        { success: false, error: 'Track not found.' },
        { status: 404 }
      );
    }

    // Aktuelle höchste Position ermitteln
    const lastTrack = await prisma.playlistTrack.findFirst({
      where: { playlistId },
      orderBy: { position: 'desc' },
    });
    const nextPosition = (lastTrack?.position ?? -1) + 1;

    // Track hinzufügen (unique constraint verhindert Duplikate)
    const playlistTrack = await prisma.playlistTrack.create({
      data: {
        playlistId,
        trackId,
        position: nextPosition,
      },
      include: {
        track: {
          select: { id: true, title: true, artist: { select: { username: true } } },
        },
      },
    });

    return NextResponse.json(
      { success: true, message: 'Track added to playlist.', data: playlistTrack },
      { status: 201 }
    );
  } catch (error: unknown) {
    // Prisma Unique-Constraint-Fehler (P2002)
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { success: false, error: 'Track is already in this playlist.' },
        { status: 409 }
      );
    }
    console.error('Add track to playlist error:', error);
    return NextResponse.json(
      { success: false, error: 'Error adding track to playlist.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/playlists/[id]/tracks
 * Entfernt einen Track und ordnet Positionen in einer Transaktion neu.
 *
 * Body: { trackId: string }
 */
export async function DELETE(
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

    const { id: playlistId } = await params;
    const body = await request.json();
    const { trackId } = body;

    if (!trackId) {
      return NextResponse.json(
        { success: false, error: 'trackId is required.' },
        { status: 400 }
      );
    }

    // PlaylistTrack finden
    const entry = await prisma.playlistTrack.findUnique({
      where: { playlistId_trackId: { playlistId, trackId } },
    });

    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'Track not found in playlist.' },
        { status: 404 }
      );
    }

    // Löschen + Positionen neu ordnen in einer Transaktion
    const remaining = await prisma.playlistTrack.findMany({
      where: { playlistId, id: { not: entry.id } },
      orderBy: { position: 'asc' },
    });

    await prisma.$transaction([
      // Track entfernen
      prisma.playlistTrack.delete({ where: { id: entry.id } }),
      // Verbleibende Positionen lückenlos neu setzen
      ...remaining.map((item, i) =>
        prisma.playlistTrack.update({
          where: { id: item.id },
          data: { position: i },
        })
      ),
    ]);

    return NextResponse.json({ success: true, message: 'Track removed from playlist.' });
  } catch (error) {
    console.error('Remove track from playlist error:', error);
    return NextResponse.json(
      { success: false, error: 'Error removing track from playlist.' },
      { status: 500 }
    );
  }
}
