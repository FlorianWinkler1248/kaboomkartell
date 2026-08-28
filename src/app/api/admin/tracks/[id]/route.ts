/**
 * Admin Track Hard-Delete
 *
 * DELETE /api/admin/tracks/[id] — Track endgültig entfernen (nur Admin)
 *
 * Abgrenzung zu DELETE /api/tracks/[id]: das ist der Soft-Delete
 * (status=ARCHIVED, isPublic=false) — der Track bleibt als Datensatz liegen
 * und die MP3 bleibt auf der Platte. Diese Route hier ist der Weg zurück:
 * DB-Zeile weg, Datei weg, Cover weg.
 *
 * Guard nach dem Muster von /api/admin/missions/[id] (ADR-039): gelöscht wird
 * NUR, was vorher archiviert wurde (sonst 409). Zwei-Stufen-Prinzip — ein
 * Fehlklick in der Track-Liste kann keinen Live-Track vernichten.
 *
 * Aufräum-Reihenfolge ist Absicht: erst DB (in einer Transaktion), dann Platte.
 * Andersherum bliebe bei einem DB-Fehler ein Datensatz zurück, der auf eine
 * nicht mehr existierende Datei zeigt — ein stiller 404 im Player. Scheitert
 * dagegen das Löschen der Datei, ist der Datensatz sauber weg und die Antwort
 * meldet die Dateileiche ehrlich (`filesDeleted` / `fileWarning`), statt sie
 * zu verschweigen.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';
import { deleteFile } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

// Lokal gespeicherte Cover liegen unter diesem Präfix (siehe cover-generator.ts).
// Alles andere in coverUrl ist eine Fremd-URL (Generator-Fallback, SoundCloud-
// Artwork) und gehört uns nicht — die fassen wir nicht an.
const LOCAL_COVER_PREFIX = '/api/uploads/covers/';

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const track = await prisma.track.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        filePath: true,
        coverUrl: true,
      },
    });

    if (!track) {
      return NextResponse.json(
        { success: false, error: 'Track not found.' },
        { status: 404 }
      );
    }

    // Guard: live sichtbare Tracks erst archivieren (Soft-Delete), dann löschen.
    if (track.status !== 'ARCHIVED') {
      return NextResponse.json(
        {
          success: false,
          error: 'Only archived tracks can be deleted. Archive it first.',
        },
        { status: 409 }
      );
    }

    // Abhängige Zeilen explizit abräumen statt auf Referenz-Aktionen der DB zu
    // bauen: die Migrations-Historie deklariert nur für upload_submissions ein
    // CASCADE, votes/playlist_tracks/pool_tracks kamen per `db push` dazu.
    // Explizit ist hier auch auf einer PostgreSQL-Produktion identisch.
    await prisma.$transaction([
      // Release-Slot wird wieder frei statt auf eine Leerstelle zu zeigen.
      prisma.releaseSlot.updateMany({
        where: { trackId: id },
        data: { trackId: null, status: 'OPEN' },
      }),
      prisma.vote.deleteMany({ where: { trackId: id } }),
      prisma.playlistTrack.deleteMany({ where: { trackId: id } }),
      prisma.poolTrack.deleteMany({ where: { trackId: id } }),
      prisma.track.delete({ where: { id } }),
    ]);

    // === Platte ===
    // RadioPlay/RadioHead bleiben bewusst unangetastet: das Play-Log ist
    // append-only History ohne FK, und der Channel-State validiert Tracks
    // ohnehin defensiv gegen die Live-Pool-Mitgliedschaft (siehe Schema-
    // Kommentar bei RadioPlay) — ein verschwundener Track wird dort neu gewürfelt.
    const filesDeleted: string[] = [];
    const fileWarnings: string[] = [];

    if (track.filePath) {
      try {
        await deleteFile(track.filePath);
        filesDeleted.push(track.filePath);
      } catch (err) {
        console.error('Admin track delete — audio file:', err);
        fileWarnings.push(track.filePath);
      }
    }

    // Cover nur löschen, wenn es lokal liegt UND kein anderer Track darauf zeigt.
    if (track.coverUrl?.startsWith(LOCAL_COVER_PREFIX)) {
      const stillInUse = await prisma.track.count({
        where: { coverUrl: track.coverUrl },
      });
      if (stillInUse === 0) {
        const relativeCoverPath = `covers/${track.coverUrl.slice(LOCAL_COVER_PREFIX.length)}`;
        try {
          await deleteFile(relativeCoverPath);
          filesDeleted.push(relativeCoverPath);
        } catch (err) {
          console.error('Admin track delete — cover file:', err);
          fileWarnings.push(relativeCoverPath);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Track "${track.title}" deleted.`,
      filesDeleted,
      // Nur gesetzt, wenn eine Datei liegen blieb — die UI macht daraus einen
      // sichtbaren Hinweis statt eines grünen "alles weg".
      ...(fileWarnings.length > 0 ? { fileWarning: fileWarnings } : {}),
    });
  } catch (error) {
    return adminErrorResponse(error, 'Admin track delete error:');
  }
}
