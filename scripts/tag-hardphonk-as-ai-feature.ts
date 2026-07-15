/**
 * Tag-Skript: Hardphonk-Tracks bekommen aiDisclosure='ai_assisted' + aiSource='boomy'.
 *
 * Hintergrund: "ai_feature" (= Human × AI Featuring, z.B. Hardphonk-Set
 * "4Flow feat. Boomy") ist im Schema NICHT als eigenes Feld abgelegt — wir
 * nutzen das existierende aiDisclosure-Feld:
 *   - 'ai_only'    → aiDisclosure='ai_generated'
 *   - 'ai_feature' → aiDisclosure='ai_assisted'
 *
 * Pool-Match: alle Pools mit slug/name LIKE %hardphonk% (genauso wie in
 * Migration 20260501190000_track_featuring_v28). Genre-Filter 'Hardtek' wird
 * NICHT erzwungen — Hardphonk-Pools sind genre='Phonk' im Repo (Phonk +
 * Hardtek-Featuring). Wir gehen nach Pool-Slug, nicht nach Genre.
 *
 * Idempotent: Skript darf mehrfach laufen — nur Tracks ohne ai_assisted /
 * ai_generated werden geupdated.
 *
 * Aufruf:
 *   pnpm tsx scripts/tag-hardphonk-as-ai-feature.ts
 *   # oder im Container:
 *   npx tsx scripts/tag-hardphonk-as-ai-feature.ts   (auf dem Server, DATABASE_URL gesetzt)
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:/app/data/kaboomkartell.db',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== tag-hardphonk-as-ai-feature startet ===');

  const pools = await prisma.pool.findMany({
    where: {
      OR: [
        { slug: { contains: 'hardphonk' } },
        { name: { contains: 'hardphonk' } },
        { name: { contains: 'hard phonk' } },
      ],
    },
    include: {
      tracks: {
        include: { track: { select: { id: true, title: true, aiDisclosure: true } } },
      },
    },
  });

  if (pools.length === 0) {
    console.log('Keine Hardphonk-Pools gefunden — nichts zu taggen.');
    return;
  }

  console.log(`Hardphonk-Pools: ${pools.map((p) => p.slug).join(', ')}`);

  const trackIds = new Set<string>();
  for (const pool of pools) {
    for (const pt of pool.tracks) {
      trackIds.add(pt.track.id);
    }
  }
  console.log(`Tracks gesamt: ${trackIds.size}`);

  let updated = 0;
  let alreadyTagged = 0;

  for (const trackId of trackIds) {
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      select: { id: true, title: true, aiDisclosure: true, aiSource: true },
    });
    if (!track) continue;

    if (track.aiDisclosure === 'ai_assisted' || track.aiDisclosure === 'ai_generated') {
      alreadyTagged++;
      continue;
    }

    await prisma.track.update({
      where: { id: track.id },
      data: { aiDisclosure: 'ai_assisted', aiSource: 'boomy' },
    });
    console.log(`  [tag] ${track.title} → ai_assisted/boomy`);
    updated++;
  }

  console.log(`=== Fertig: ${updated} getaggt, ${alreadyTagged} bereits getaggt ===`);
}

main()
  .catch((e) => {
    console.error('Tag-Skript fehlgeschlagen:', e);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
