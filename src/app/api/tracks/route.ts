/**
 * Tracks API Route
 *
 * GET  /api/tracks - Publizierte Tracks auflisten (öffentlich)
 * POST /api/tracks - Neuen Track erstellen (nur Admin, nach Upload)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { createTrackSchema, createSoundcloudTrackSchema } from '@/lib/validations';
import { slugify } from '@/lib/utils';
import { fetchSoundcloudMetadata } from '@/lib/soundcloud';
import { attachTrackToPool } from '@/lib/boomy';
import { isGenre, genrePoolSlug } from '@/lib/constants';
import { getAbsolutePath } from '@/lib/storage';
import { tryGetMp3Duration } from '@/lib/mp3-duration';

/**
 * GET /api/tracks - Publizierte Tracks auflisten
 *
 * Query-Parameter:
 * - page (default: 1)
 * - pageSize (default: 20, max: 100)
 * - status (default: PUBLISHED, Admin kann alle sehen)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));
    const skip = (page - 1) * pageSize;

    // Nicht-Admins sehen nur öffentliche Tracks (isPublic). Admins sehen alles
    // und können per ?isPublic=true|false bzw. ?status=... filtern.
    const session = await auth();
    const isAdmin = session?.user?.role === 'ADMIN';
    const statusFilter = searchParams.get('status');
    const isPublicParam = searchParams.get('isPublic');

    const where: { isPublic?: boolean; status?: string } = {};
    if (!isAdmin) {
      where.isPublic = true;
    } else {
      if (isPublicParam === 'true') where.isPublic = true;
      else if (isPublicParam === 'false') where.isPublic = false;
      if (statusFilter) where.status = statusFilter;
    }

    const [tracks, total] = await Promise.all([
      prisma.track.findMany({
        where,
        include: {
          artist: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
          // v2.8: Featuring-Artist mitladen, falls vorhanden.
          featuringArtist: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: pageSize,
      }),
      prisma.track.count({ where }),
    ]);

    // Tracks mit Stream-URL anreichern
    const tracksWithStreamUrl = tracks.map((track) => ({
      id: track.id,
      title: track.title,
      slug: track.slug,
      trackType: track.trackType,
      duration: track.duration,
      coverUrl: track.coverUrl,
      genre: track.genre,
      bpm: track.bpm,
      playCount: track.playCount,
      status: isAdmin ? track.status : undefined,
      isPublic: track.isPublic,
      artist: track.artist,
      featuringArtist: track.featuringArtist,
      streamUrl: track.trackType === 'LOCAL' ? `/api/tracks/${track.id}/stream` : '',
      soundcloudUrl: track.trackType === 'SOUNDCLOUD' ? track.soundcloudUrl : undefined,
      soundcloudEmbedUrl: track.trackType === 'SOUNDCLOUD' ? track.soundcloudEmbedUrl : undefined,
      // AI-Disclosure und Voting-Felder
      aiDisclosure: track.aiDisclosure,
      aiSource: track.aiSource,
      auraCount: track.auraCount,
      susCount: track.susCount,
      totalVotes: track.totalVotes,
      susPercentage: track.susPercentage,
      // Admin-Only Felder
      ...(isAdmin ? {
        fileName: track.fileName,
        filePath: track.filePath,
        fileSize: track.fileSize,
        description: track.description,
        sortOrder: track.sortOrder,
        soundcloudArtwork: track.soundcloudArtwork,
        createdAt: track.createdAt,
        updatedAt: track.updatedAt,
      } : {}),
    }));

    return NextResponse.json({
      success: true,
      data: tracksWithStreamUrl,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Track list error:', error);
    return NextResponse.json(
      { success: false, error: 'Error loading tracks.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tracks - Neuen Track erstellen
 *
 * Erwartet JSON-Body mit Track-Metadaten.
 * Die Datei muss vorher via /api/upload hochgeladen worden sein.
 *
 * Body: { title, genre?, bpm?, description?, artistId?,
 *         fileName, filePath, fileSize, duration }
 */
export async function POST(request: NextRequest) {
  try {
    // Auth-Check (Middleware schuetzt bereits, aber doppelt hält besser)
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const trackType = body.trackType || 'LOCAL';

    // === SoundCloud Track-Erstellung ===
    if (trackType === 'SOUNDCLOUD') {
      const scResult = createSoundcloudTrackSchema.safeParse(body);
      if (!scResult.success) {
        return NextResponse.json(
          { success: false, error: 'Validation error', details: scResult.error.flatten().fieldErrors },
          { status: 400 }
        );
      }

      // Metadaten von SoundCloud holen
      let scMeta;
      try {
        scMeta = await fetchSoundcloudMetadata(scResult.data.soundcloudUrl);
      } catch (err) {
        return NextResponse.json(
          { success: false, error: `SoundCloud error: ${err instanceof Error ? err.message : 'Unknown'}` },
          { status: 400 }
        );
      }

      const scTitle = scResult.data.title || scMeta.title;
      let slug = slugify(scTitle);
      const existingSlug = await prisma.track.findUnique({ where: { slug } });
      if (existingSlug) slug = `${slug}-${Date.now().toString(36)}`;

      const scGenre = scResult.data.genre || null;

      // ADR-041: SC-Track einem externen Artist-Profil zuordnen (Showcase).
      const scProfileId = scResult.data.artistProfileId || null;
      if (scProfileId) {
        const profileExists = await prisma.artistProfile.findUnique({
          where: { id: scProfileId },
          select: { id: true },
        });
        if (!profileExists) {
          return NextResponse.json(
            { success: false, error: 'Artist profile not found.' },
            { status: 400 }
          );
        }
      }

      const track = await prisma.track.create({
        data: {
          title: scTitle,
          slug,
          trackType: 'SOUNDCLOUD',
          soundcloudUrl: scResult.data.soundcloudUrl,
          soundcloudEmbedUrl: scMeta.embedUrl,
          soundcloudArtwork: scMeta.artworkUrl,
          coverUrl: scMeta.artworkUrl || null,
          genre: scGenre,
          description: scResult.data.description || scMeta.description || null,
          aiDisclosure: body.aiDisclosure || null,
          aiSource: body.aiSource || null,
          isPublic: body.isPublic === true,
          duration: 0,
          artistId: scResult.data.artistId || session.user.id,
          uploaderId: session.user.id,
          artistProfileId: scProfileId,
        },
        include: {
          artist: { select: { id: true, username: true, displayName: true } },
        },
      });

      // In den Genre-Pool einhängen, falls das Genre eines der 4 KBK-Genres ist.
      // Showcase-Tracks externer Künstler (artistProfileId) bleiben draußen —
      // sie sind kein Genre-Vorrat und würden Pool-Zählungen verfälschen
      // (airplay-harmlos wären sie eh: mapPoolTracks filtert auf LOCAL).
      const scPoolSlug = !scProfileId && isGenre(scGenre) ? genrePoolSlug(scGenre) : null;
      if (scPoolSlug) {
        await attachTrackToPool(track.id, scPoolSlug);
      }

      return NextResponse.json(
        {
          success: true,
          message: scPoolSlug
            ? `SoundCloud track created and added to the ${scGenre} pool.`
            : 'SoundCloud track created.',
          data: { ...track, streamUrl: '', trackType: 'SOUNDCLOUD', pool: scPoolSlug },
        },
        { status: 201 }
      );
    }

    // === Lokaler Track-Erstellung (bestehende Logik) ===

    // Metadaten validieren
    const metaResult = createTrackSchema.safeParse(body);
    if (!metaResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: metaResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // Datei-Felder müssen separat vorhanden sein
    const { fileName, filePath, fileSize, duration } = body;
    if (!fileName || !filePath || !fileSize || duration === undefined) {
      return NextResponse.json(
        { success: false, error: 'File information missing (fileName, filePath, fileSize, duration).' },
        { status: 400 }
      );
    }

    const { title, genre, bpm, description, artistId, isPublic } = metaResult.data;
    const { aiDisclosure, aiSource } = body;

    // Slug generieren (einzigartig machen)
    let slug = slugify(title);
    const existingSlug = await prisma.track.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Radio Sync v2: Dauer server-seitig aus der echten MP3-Datei extrahieren.
    // Die Conductor-Zeitlinie (endsAt = startedAt + duration) ist nur korrekt,
    // wenn die DB-Dauer der echten Audio-Länge entspricht. Der vom Client
    // gemeldete Wert ist nur noch Fallback, falls der MP3-Header nicht lesbar
    // ist (kein CBR / kaputte Datei). Idempotent zur Boomy-auto-publish-Logik.
    const extractedDuration = tryGetMp3Duration(getAbsolutePath(filePath));
    const effectiveDuration = extractedDuration ?? (parseFloat(duration) || 0);

    // Track erstellen
    const track = await prisma.track.create({
      data: {
        title,
        slug,
        trackType: 'LOCAL',
        fileName,
        filePath,
        fileSize: Math.round(fileSize),
        duration: effectiveDuration,
        genre: genre || null,
        bpm: bpm || null,
        description: description || null,
        aiDisclosure: aiDisclosure || null,
        aiSource: aiSource || null,
        isPublic: isPublic === true,
        artistId: artistId || session.user.id,
        uploaderId: session.user.id,
      },
      include: {
        artist: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    // In den Genre-Pool einhängen, falls das Genre eines der 4 KBK-Genres ist.
    const poolSlug = isGenre(genre) ? genrePoolSlug(genre) : null;
    if (poolSlug) {
      await attachTrackToPool(track.id, poolSlug);
    }

    return NextResponse.json(
      {
        success: true,
        message: poolSlug
          ? `Track created and added to the ${genre} pool.`
          : 'Track created.',
        data: {
          ...track,
          streamUrl: `/api/tracks/${track.id}/stream`,
          pool: poolSlug,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Track creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Error creating track.' },
      { status: 500 }
    );
  }
}
