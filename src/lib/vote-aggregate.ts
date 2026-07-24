/**
 * Vote-Aggregation — zählt die Vote-Zeilen eines Tracks neu und schreibt die
 * Cache-Felder (auraCount/susCount/totalVotes/susPercentage) am Track.
 *
 * Gleiche Logik wie inline in /api/tracks/[id]/vote (Bestand) — hier als
 * Helfer für Pfade, die mehrere Tracks in einer Transaktion aktualisieren
 * (Session-Like-Import). Immer NEU ZÄHLEN, nie inkrementieren.
 */

import type { Prisma } from '@/generated/prisma/client';

type Tx = Prisma.TransactionClient;

export async function recalcTrackVoteStats(tx: Tx, trackId: string): Promise<void> {
  const [totalVotes, auraVotes, susVotes] = await Promise.all([
    tx.vote.count({ where: { trackId } }),
    tx.vote.count({ where: { trackId, aura: true } }),
    tx.vote.count({ where: { trackId, sus: true } }),
  ]);

  const susPercentage = totalVotes > 0 ? Math.round((susVotes / totalVotes) * 100) : 0;

  await tx.track.update({
    where: { id: trackId },
    data: {
      auraCount: auraVotes,
      susCount: susVotes,
      totalVotes,
      susPercentage,
    },
  });
}
