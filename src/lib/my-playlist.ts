/**
 * My-Playlist-Helfer — pure Partition-Logik für den Session-Like-Import
 * (ADR-041). Server-safe UND client-safe: kein prisma, keine Seiteneffekte.
 *
 * Kein-Blenden-Regel: importiert werden nur Likes, die als echte Votes
 * bestehen dürften — LOCAL-Tracks brauchen die getrackte Hörzeit >= 60s,
 * SOUNDCLOUD-Tracks sind ausgenommen (Hörzeit läuft im SC-Widget, unmessbar).
 */

import { VOTING_CONFIG } from '@/lib/constants';

export interface ImportCandidate {
  trackId: string;
  listenedSeconds: number;
}

export interface ImportTrackInfo {
  id: string;
  trackType: string;
  isPublic: boolean;
}

export interface ImportPartition {
  importable: ImportCandidate[];
  skipped: number;
}

/**
 * Teilt eingereichte Session-Likes in importierbar / übersprungen.
 * - Duplikate (gleiche trackId) → erster Eintrag gewinnt, Rest skipped
 * - unbekannter oder nicht-öffentlicher Track → skipped
 * - LOCAL mit Hörzeit < 60s → skipped (ehrliche Votes)
 * - SOUNDCLOUD → immer importierbar
 */
export function partitionImportLikes(
  tracks: ImportTrackInfo[],
  likes: ImportCandidate[]
): ImportPartition {
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const importable: ImportCandidate[] = [];
  let skipped = 0;

  for (const like of likes) {
    if (seen.has(like.trackId)) {
      skipped++;
      continue;
    }
    seen.add(like.trackId);

    const track = trackById.get(like.trackId);
    if (!track || !track.isPublic) {
      skipped++;
      continue;
    }
    if (
      track.trackType !== 'SOUNDCLOUD' &&
      like.listenedSeconds < VOTING_CONFIG.minListenSeconds
    ) {
      skipped++;
      continue;
    }
    importable.push(like);
  }

  return { importable, skipped };
}
