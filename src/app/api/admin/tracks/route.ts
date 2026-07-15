/**
 * Admin Tracks API Route
 *
 * GET /api/admin/tracks - Tracks mit erweiterten Admin-Filtern auflisten
 *
 * Unterstützt serverseitige Pagination, Genre-/Status-Filter und Textsuche
 * für die Admin-Track-Verwaltungsseite.
 *
 * Query-Parameter:
 *   - page      (default: 1)
 *   - pageSize  (default: 10, max: 100)
 *   - status    ("ALL" | "PUBLIC" | "HIDDEN" | "ARCHIVED", default: "ALL")
 *   - genre     (leer = alle Genres)
 *   - search    (case-insensitive, sucht in Titel + Artist displayName/username)
 *
 * Antwort enthält zusätzlich die Liste aller verfügbaren Genres,
 * damit der Client das Dropdown befüllen kann, ohne eine zweite Route aufzurufen.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';

// Erlaubte Werte für den Sichtbarkeits-Filter (ALL = kein Filter).
// PUBLIC = isPublic=true, HIDDEN = nicht öffentlich + nicht archiviert,
// ARCHIVED = Soft-deleted.
const ALLOWED_VIEWS = ['ALL', 'PUBLIC', 'HIDDEN', 'ARCHIVED'] as const;
type ViewFilter = (typeof ALLOWED_VIEWS)[number];

export async function GET(request: NextRequest) {
  try {
    // Auth-Guard: nur Admins dürfen alle Tracks sehen
    const { error } = await requireAdmin();
    if (error) return error;

    const { searchParams } = new URL(request.url);

    // Pagination-Parameter einlesen und begrenzen
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') || '10'))
    );
    const skip = (page - 1) * pageSize;

    // Sichtbarkeits-Filter normalisieren
    const rawView = (searchParams.get('status') || 'ALL').toUpperCase();
    const view: ViewFilter = (ALLOWED_VIEWS as readonly string[]).includes(rawView)
      ? (rawView as ViewFilter)
      : 'ALL';

    // Genre- und Suchfilter — leer bedeutet "kein Filter"
    const genre = (searchParams.get('genre') || '').trim();
    const search = (searchParams.get('search') || '').trim();

    // WHERE-Bedingung dynamisch zusammenbauen
    // Hinweis: SQLite unterstützt Prisma's `mode: 'insensitive'` nicht,
    // daher arbeiten wir hier mit `contains` (LIKE %x%), was auf SQLite
    // standardmäßig case-insensitive für ASCII ist.
    const where: Record<string, unknown> = {};

    if (view === 'PUBLIC') {
      where.isPublic = true;
    } else if (view === 'HIDDEN') {
      where.isPublic = false;
      where.status = { not: 'ARCHIVED' };
    } else if (view === 'ARCHIVED') {
      where.status = 'ARCHIVED';
    }

    if (genre) {
      where.genre = genre;
    }

    if (search) {
      // Suche in Track-Titel sowie im Artist-Namen (displayName + username)
      where.OR = [
        { title: { contains: search } },
        { artist: { displayName: { contains: search } } },
        { artist: { username: { contains: search } } },
      ];
    }

    // Zwei parallele Queries:
    //   1) Tracks (paginiert, gefiltert)
    //   2) Gesamtanzahl für Pagination
    // Plus eine dritte für die verfügbaren Genres (distinct) — nur einmal pro Request
    const [tracks, total, genreRows] = await Promise.all([
      prisma.track.findMany({
        where,
        include: {
          artist: {
            select: { id: true, username: true, displayName: true },
          },
          featuringArtist: {
            select: { id: true, username: true, displayName: true },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      prisma.track.count({ where }),
      prisma.track.findMany({
        where: { genre: { not: null } },
        select: { genre: true },
        distinct: ['genre'],
        orderBy: { genre: 'asc' },
      }),
    ]);

    // Tracks mit Stream-URL und allen Admin-Feldern anreichern
    const data = tracks.map((track) => ({
      id: track.id,
      title: track.title,
      slug: track.slug,
      trackType: track.trackType,
      duration: track.duration,
      coverUrl: track.coverUrl,
      soundcloudArtwork: track.soundcloudArtwork,
      genre: track.genre,
      bpm: track.bpm,
      status: track.status,
      isPublic: track.isPublic,
      aiDisclosure: track.aiDisclosure,
      playCount: track.playCount,
      fileName: track.fileName,
      fileSize: track.fileSize,
      soundcloudUrl: track.soundcloudUrl,
      artist: track.artist,
      featuringArtist: track.featuringArtist,
      streamUrl:
        track.trackType === 'LOCAL' ? `/api/tracks/${track.id}/stream` : '',
      createdAt: track.createdAt,
    }));

    const genres = genreRows
      .map((row) => row.genre)
      .filter((g): g is string => Boolean(g));

    return NextResponse.json({
      success: true,
      data,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      genres,
    });
  } catch (error) {
    return adminErrorResponse(error, 'Admin tracks list error:');
  }
}
