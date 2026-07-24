/**
 * Cover-Generator — Kernlogik der externen Cover-Erzeugung (ADR-041-Refactor).
 *
 * Vorher lebte alles inline in /api/admin/cover-regenerate. Extrahiert, damit
 * (a) das Studio pro Track Sprites generieren kann (rate-limited) und
 * (b) accentForTrack erstmals testbar ist.
 *
 * MASTER_HUB_URL/TOKEN bleiben ausschließlich serverseitig (ADR-038 — keine
 * Secrets Richtung Client). Cover werden lokal gespiegelt; Fallback ist die
 * Generator-URL.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GENRE_ACCENT, BOOMY_PURPLE, AI_DISCLOSURE, isGenre } from '@/lib/constants';

const MASTER_HUB_URL = process.env.MASTER_HUB_URL || '';
const MASTER_HUB_TOKEN = process.env.MASTER_HUB_TOKEN || '';
// Lokales Cover-Verzeichnis (Container-Pfad, per Env/Deploy gemountet).
const LOCAL_COVER_DIR = process.env.COVER_DIR || '/app/uploads/covers';

export function masterHubConfigured(): boolean {
  return Boolean(MASTER_HUB_TOKEN);
}

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
export function accentForTrack(track: {
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

export function safeCoverFilename(trackId: string): string {
  return `track-${trackId.replace(/[^a-zA-Z0-9]/g, '')}.png`;
}

/**
 * Erzeugt ein Cover beim MASTER_HUB und spiegelt es lokal. Aktualisiert NICHT
 * die DB — das macht der Aufrufer. ~1–2s Latenz + Rechenzeit beim Hub,
 * 90s-Timeout wie die Admin-Batch-Route.
 */
export async function generateCoverForTrack(
  track: { id: string; title: string; genre: string | null; aiDisclosure: string | null },
  artistName: string
): Promise<{ url: string } | { error: string }> {
  if (!MASTER_HUB_TOKEN) {
    return { error: 'Cover service not configured.' };
  }

  const filename = safeCoverFilename(track.id);
  const cover = accentForTrack(track);

  let data: ApiCoverResponse;
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
    data = await resp.json().catch(() => ({}) as ApiCoverResponse);
    if (!resp.ok || !data.url) {
      return { error: data.error || `HTTP ${resp.status}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  // Cover lokal sichern — Fallback auf die Generator-URL, falls der Download
  // scheitert. Bei erfolgreichem Lokal-Save zeigt die URL auf den KBK-internen
  // Pfad und ist unabhängig vom Generator-Cleanup.
  const localFilename = data.filename || filename;
  const localPath = path.join(LOCAL_COVER_DIR, localFilename);
  const localPublicUrl = `/api/uploads/covers/${localFilename}`;
  let finalUrl = data.url as string;
  try {
    await fs.promises.mkdir(LOCAL_COVER_DIR, { recursive: true });
    const imgResp = await fetch(data.url as string, { signal: AbortSignal.timeout(30_000) });
    if (imgResp.ok) {
      const buf = Buffer.from(await imgResp.arrayBuffer());
      if (buf.length > 100) {
        await fs.promises.writeFile(localPath, buf);
        finalUrl = localPublicUrl;
      }
    }
  } catch (saveErr) {
    console.warn(
      `[cover-generator] local save failed for ${track.id}, falling back to generator URL:`,
      saveErr
    );
  }

  return { url: finalUrl };
}
