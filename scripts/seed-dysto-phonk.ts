/**
 * Seed-Script für den Dysto-Phonk-Pool
 *
 * Liest alle MP3s aus /app/uploads/tracks/ und legt Track-Einträge in der DB an.
 * Annahmen:
 *   - Boomy-User existiert bereits (aus prisma/seed.ts)
 *   - Admin-User existiert bereits (aus prisma/seed.ts, ADMIN_EMAIL aus .env)
 *   - Cover-Datei liegt unter uploads/covers/dysto-phonk-cover.jpg
 *   - Die MP3s sind Suno-generiert (aiDisclosure=ai_generated, aiSource=suno)
 *   - Artist: Boomy (alle Tracks)
 *
 * Duration-Schätzung: fileSize / 24000 (entspricht ~192 kbps CBR MP3).
 * Für eine exakte Duration später mit ffprobe nachziehen.
 *
 * Aufruf im Container:
 *   npx tsx scripts/seed-dysto-phonk.ts   (auf dem Server, DATABASE_URL gesetzt)
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import fs from 'fs';
import path from 'path';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:/app/data/kaboomkartell.db',
});
const prisma = new PrismaClient({ adapter });

const UPLOADS_DIR = '/app/uploads';
const TRACKS_DIR = path.join(UPLOADS_DIR, 'tracks');
const COVER_RELATIVE = 'covers/dysto-phonk-cover.jpg';
const GENRE = 'phonk';
const AI_DISCLOSURE = 'ai_generated';
const AI_SOURCE = 'suno';
const STATUS = 'PUBLISHED';

/**
 * Erzeugt einen URL-tauglichen Slug aus einem Titel.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Entfernt SUNO-Präfix und Dateiendung, um einen lesbaren Titel zu bekommen.
 */
function cleanTitle(fileName: string): string {
  return fileName
    .replace(/^SUNO - /i, '')
    .replace(/\.mp3$/i, '')
    .trim();
}

async function main() {
  console.log('=== Dysto-Phonk-Seed startet ===');

  // Artist: Boomy
  const boomy = await prisma.user.findUnique({ where: { username: 'boomy' } });
  if (!boomy) {
    throw new Error('Boomy-User nicht gefunden — bitte erst prisma/seed.ts laufen lassen');
  }
  console.log(`Artist: ${boomy.username} (${boomy.id})`);

  // Uploader: erster Admin-User (aus Seed als ADMIN angelegt)
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    throw new Error('Kein Admin-User gefunden — bitte erst prisma/seed.ts laufen lassen');
  }
  console.log(`Uploader: ${admin.username} (${admin.id})`);

  // Tracks-Verzeichnis einlesen
  if (!fs.existsSync(TRACKS_DIR)) {
    throw new Error(`Tracks-Verzeichnis fehlt: ${TRACKS_DIR}`);
  }
  const files = fs
    .readdirSync(TRACKS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.mp3'))
    .sort();

  if (files.length === 0) {
    console.log('Keine MP3s gefunden — Abbruch.');
    return;
  }
  console.log(`Gefunden: ${files.length} MP3-Dateien`);

  let created = 0;
  let skipped = 0;
  let sortOrder = 10;

  for (const fileName of files) {
    const fullPath = path.join(TRACKS_DIR, fileName);
    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const duration = Math.round((fileSize / 24000) * 10) / 10; // auf 0.1s gerundet

    const title = cleanTitle(fileName);
    const slug = slugify(title);
    const filePath = `tracks/${fileName}`;

    const existing = await prisma.track.findUnique({ where: { slug } });
    if (existing) {
      console.log(`  [skip] ${title} — slug "${slug}" existiert bereits`);
      skipped++;
      continue;
    }

    await prisma.track.create({
      data: {
        title,
        slug,
        trackType: 'LOCAL',
        fileName,
        filePath,
        fileSize,
        duration,
        coverUrl: COVER_RELATIVE,
        genre: GENRE,
        status: STATUS,
        aiDisclosure: AI_DISCLOSURE,
        aiSource: AI_SOURCE,
        sortOrder,
        publishedAt: new Date(),
        artistId: boomy.id,
        uploaderId: admin.id,
      },
    });

    console.log(`  [create] ${title} (${(duration / 60).toFixed(1)}min, ${(fileSize / 1024 / 1024).toFixed(1)}MB)`);
    created++;
    sortOrder += 10;
  }

  console.log(`=== Fertig: ${created} erstellt, ${skipped} übersprungen ===`);
}

main()
  .catch((e) => {
    console.error('Seed fehlgeschlagen:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
