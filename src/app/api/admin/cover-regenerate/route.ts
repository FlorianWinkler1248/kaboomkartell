import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';
import { GENRE_ACCENT, BOOMY_PURPLE, AI_DISCLOSURE, isGenre } from '@/lib/constants';

/**
 * POST /api/admin/cover-regenerate
 *
 * Lässt für alle öffentlichen Tracks ohne `coverUrl` ein Cover von einem
 * externen Generator-Dienst erzeugen und aktualisiert die Track-Records.
 *
 * Auth: Admin-Session erforderlich (Flow-only).
 *
 * Der Generator-Dienst wird über `MASTER_HUB_URL` (+ Bearer `MASTER_HUB_TOKEN`)
 * angesprochen; beide kommen aus dem Environment. Antwort: { url, path, filename }.
 *
 * Response: { success: true, generated, failed, skipped, errors }
 */

const MASTER_HUB_URL = process.env.MASTER_HUB_URL || '';
const MASTER_HUB_TOKEN = process.env.MASTER_HUB_TOKEN || '';
// Lokales Cover-Verzeichnis (Container-Pfad, per Env/Deploy gemountet). Cover
// werden hier zusätzlich gespiegelt, damit sie unabhängig vom Generator bleiben.
const LOCAL_COVER_DIR = process.env.COVER_DIR || '/app/uploads/covers';

type ApiCoverResponse = {
  url?: string;
  path?: string;
  filename?: string;
  error?: string;
  stderr?: string;
};

// Cover-Akzent für einen Track — Fälle nach KI-Anteil + Genre:
//   Boomy-only (ai_generated)  → reines Boomy-Lila
//   Hybrid (ai_assisted)       → Genre-Farbe + Boomy-Lila (Dual-Accent)
//   Hybrid + Brazilian Phonk   → Brazilian-Grün + Phonk-Rot + Boomy-Lila
//                                (Tri-Accent — Brazilian ist Phonk-Subgenre)
//   Human / kein KI-Anteil     → nur Genre-Farbe
// accent2 aktiviert ein Dual-Accent-Sprite, accent3 zusätzlich ein
// Tri-Accent-Sprite (wird vom externen Cover-Generator ausgewertet).
function accentForTrack(track: {
  genre: string | null;
  aiDisclosure: string | null;
}): { accent: string; accent2?: string; accent3?: string } {
  const genreColor = isGenre(track.genre) ? GENRE_ACCENT[track.genre] : '#3FCF4A';
  if (track.aiDisclosure === AI_DISCLOSURE.AI_GENERATED) {
    return { accent: BOOMY_PURPLE };
  }
  if (track.aiDisclosure === AI_DISCLOSURE.AI_ASSISTED) {
    // Brazilian Phonk ist ein Phonk-Subgenre — Hybrid-Cover bekommt drei
    // Farben: Brazilian-Grün (Genre) + Phonk-Rot (Parent-Genre) + Boomy-Lila
    // (KI-Anteil). Flow-Entscheidung 16.05.2026.
    if (track.genre === 'Brazilian Phonk') {
      return { accent: genreColor, accent2: GENRE_ACCENT.Phonk, accent3: BOOMY_PURPLE };
    }
    return { accent: genreColor, accent2: BOOMY_PURPLE };
  }
  return { accent: genreColor };
}

function safeFilename(trackId: string): string {
  return `track-${trackId.replace(/[^a-zA-Z0-9]/g, '')}.png`;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Admin-Auth
    const { error } = await requireAdmin();
    if (error) return error;

    if (!MASTER_HUB_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'MASTER_HUB_TOKEN is not configured.' },
        { status: 500 }
      );
    }

    // 2. Body (optional): { force?, limit?, poolName? }
    // poolName filtert auf Tracks die in einem bestimmten Pool sind (z.B.
    // "HARDPHONK SESSIONS"). Plus force=true regeneriert auch existing covers.
    let body: { force?: boolean; limit?: number; poolName?: string } = {};
    try {
      body = await request.json();
    } catch {
      // leer ist ok
    }
    const force = Boolean(body.force);
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 200) : 50;
    const poolName = typeof body.poolName === 'string' && body.poolName.trim().length > 0
      ? body.poolName.trim()
      : null;

    // 3. Kandidaten-Tracks laden
    const tracks = await prisma.track.findMany({
      where: {
        isPublic: true,
        ...(force ? {} : { coverUrl: null }),
        ...(poolName
          ? { poolTracks: { some: { pool: { name: poolName } } } }
          : {}),
      },
      include: {
        artist: { select: { displayName: true, username: true } },
      },
      take: limit,
    });

    if (tracks.length === 0) {
      return NextResponse.json({
        success: true,
        generated: 0,
        failed: 0,
        skipped: 0,
        message: 'No tracks without covers found.',
      });
    }

    const results = {
      generated: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ id: string; title: string; error: string }>,
    };

    // 4. Sequenziell (Rate-Limit freundlich, ~1-2s pro Cover)
    for (const track of tracks) {
      const artistName = track.artist.displayName || track.artist.username || 'UNKNOWN';
      const filename = safeFilename(track.id);
      const cover = accentForTrack(track);

      try {
        const resp = await fetch(`${MASTER_HUB_URL}/api/cover/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${MASTER_HUB_TOKEN}`,
          },
          body: JSON.stringify({
            title: track.title,
            artist: artistName,
            filename,
            accent: cover.accent,
            ...(cover.accent2 ? { accent2: cover.accent2 } : {}),
            ...(cover.accent3 ? { accent3: cover.accent3 } : {}),
          }),
          // 90s Timeout (Cover-Generation kann bis 60s brauchen)
          signal: AbortSignal.timeout(90_000),
        });

        const data: ApiCoverResponse = await resp.json().catch(() => ({} as ApiCoverResponse));

        if (!resp.ok || !data.url) {
          results.failed += 1;
          results.errors.push({
            id: track.id,
            title: track.title,
            error: data.error || `HTTP ${resp.status}`,
          });
          continue;
        }

        // 5. Cover lokal sichern — Fallback auf die Generator-URL, falls der
        // Download scheitert. Bei erfolgreichem Lokal-Save zeigt coverUrl auf den
        // KBK-internen Pfad und ist unabhängig vom Generator-Cleanup.
        const localFilename = data.filename || filename;
        const localPath = path.join(LOCAL_COVER_DIR, localFilename);
        const localPublicUrl = `/api/uploads/covers/${localFilename}`;
        let finalUrl = data.url;
        try {
          await fs.promises.mkdir(LOCAL_COVER_DIR, { recursive: true });
          const imgResp = await fetch(data.url, { signal: AbortSignal.timeout(30_000) });
          if (imgResp.ok) {
            const buf = Buffer.from(await imgResp.arrayBuffer());
            if (buf.length > 100) {
              await fs.promises.writeFile(localPath, buf);
              finalUrl = localPublicUrl;
            }
          }
        } catch (saveErr) {
          console.warn(
            `[cover-regenerate] local save failed for ${track.id}, falling back to generator URL:`,
            saveErr,
          );
        }

        // 6. Track updaten (lokale URL bevorzugt, Generator-URL als Fallback)
        await prisma.track.update({
          where: { id: track.id },
          data: { coverUrl: finalUrl },
        });
        results.generated += 1;
      } catch (err) {
        results.failed += 1;
        results.errors.push({
          id: track.id,
          title: track.title,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      totalProcessed: tracks.length,
    });
  } catch (error) {
    return adminErrorResponse(error, 'Admin cover-regenerate error:');
  }
}

// GET gibt Status: wie viele Tracks ohne Cover sind da
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const withoutCover = await prisma.track.count({
      where: { isPublic: true, coverUrl: null },
    });
    const total = await prisma.track.count({ where: { isPublic: true } });

    return NextResponse.json({
      success: true,
      withoutCover,
      total,
      masterHubConfigured: Boolean(MASTER_HUB_TOKEN),
    });
  } catch (error) {
    return adminErrorResponse(error, 'Admin cover-regenerate status error:');
  }
}
