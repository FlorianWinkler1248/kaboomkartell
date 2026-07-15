/**
 * Tag-Skript: Phonk-Set #1 (Boomy-only) bekommt aiDisclosure='ai_generated'.
 *
 * Hintergrund: Phonk Set #1 sind Tracks aus dem Phonk-Source-Pool, die Boomy
 * solo released hat (kein 4Flow-Featuring). Diese kriegen 'ai_only', also
 * aiDisclosure='ai_generated' + aiSource='suno' (Boomys default Source laut
 * BOOMY_CONFIG).
 *
 * Match-Logik:
 *   - Track.artistId == boomy.id (Hauptartist ist Boomy)
 *   - genre matched 'Phonk' (case-insensitive contains)
 *   - featuringArtistId IS NULL (kein Featuring → solo)
 *
 * Pool-basierte Variante (alternativ): alle Pools mit slug LIKE 'src-phonk-ki'
 * — entspricht dem KI-Source-Pool von Phonk. Wir nehmen die Artist-basierte
 * Variante, weil die robuster gegen Pool-Umbenennungen ist.
 *
 * Idempotent: Tracks die bereits 'ai_generated' sind, bleiben unangetastet.
 *
 * Aufruf:
 *   pnpm tsx scripts/tag-phonk-boomy-only-as-ai-only.ts
 *   # oder im Container:
 *   npx tsx scripts/tag-phonk-boomy-only-as-ai-only.ts   (auf dem Server, DATABASE_URL gesetzt)
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:/app/data/kaboomkartell.db',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== tag-phonk-boomy-only-as-ai-only startet ===');

  const boomy = await prisma.user.findUnique({
    where: { username: 'boomy' },
    select: { id: true },
  });
  if (!boomy) {
    throw new Error('Boomy-User nicht gefunden — erst prisma/seed.ts laufen lassen.');
  }

  const tracks = await prisma.track.findMany({
    where: {
      artistId: boomy.id,
      featuringArtistId: null,
      genre: { contains: 'phonk' },
    },
    select: { id: true, title: true, aiDisclosure: true, aiSource: true },
  });

  console.log(`Boomy-Phonk-Solo-Tracks: ${tracks.length}`);

  let updated = 0;
  let alreadyTagged = 0;

  for (const track of tracks) {
    if (track.aiDisclosure === 'ai_generated') {
      alreadyTagged++;
      continue;
    }

    await prisma.track.update({
      where: { id: track.id },
      data: { aiDisclosure: 'ai_generated', aiSource: 'suno' },
    });
    console.log(`  [tag] ${track.title} → ai_generated/suno`);
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
