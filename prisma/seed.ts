/**
 * Prisma Seed-Script (Prisma 7)
 *
 * Erstellt den Admin-User (4Flow) und Site-Settings.
 * Ausführen mit: npx prisma db seed
 */

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import bcrypt from 'bcrypt';

// Inline-Definition der 4 KBK-Genre-Pools (Single Source of Truth bleibt
// `src/lib/constants.ts` GENRES, aber Seed läuft im Runner-Container ohne
// src/-Zugriff und muss daher self-contained sein).
const GENRE_POOL_DEFS: Array<{ slug: string; name: string; genre: string; description: string }> = [
  { slug: 'phonk',           name: 'Phonk',           genre: 'Phonk',           description: 'Phonk — Memphis-driven underground heat.' },
  { slug: 'hardtek',         name: 'Hardtek',         genre: 'Hardtek',         description: 'Hardtek — raw kicks and rave voltage.' },
  { slug: 'raggatek',        name: 'Raggatek',        genre: 'Raggatek',        description: 'Raggatek — sound-system warfare meets hard kicks.' },
  { slug: 'brazilian-phonk', name: 'Brazilian Phonk', genre: 'Brazilian Phonk', description: 'Brazilian Phonk — funk-fueled phonk with baile energy.' },
];

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding der Datenbank...');

  // === Admin-User (4Flow) erstellen ===
  // Keine Default-Credentials im Code — das Repo ist öffentlich. Fehlt eine der
  // Pflicht-Env-Vars, bricht der Seed hart ab (kein still gesetztes Bekannt-Passwort).
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminUsername = process.env.ADMIN_USERNAME || '4Flow';
  if (!adminEmail || !adminPassword) {
    throw new Error(
      '[seed] ADMIN_EMAIL und ADMIN_PASSWORD muessen im Environment gesetzt sein ' +
        '(keine Default-Credentials, Repo ist oeffentlich).',
    );
  }

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const admin = await prisma.user.create({
      data: {
        username: adminUsername,
        email: adminEmail,
        passwordHash,
        role: 'ADMIN',
        displayName: '4Flow',
        bio: 'Gründer und Leiter des KaboomKartell. Raggatek & Hardtek Producer.',
      },
    });

    console.log(`✅ Admin-User erstellt: ${admin.username} (${admin.email})`);
  } else {
    console.log(`ℹ️  Admin-User existiert bereits: ${existingAdmin.username}`);
  }

  // === KI-Resident Boomy erstellen ===
  const boomyEmail = 'boomy@kaboomkartell.de';
  const boomyUsername = 'boomy';

  const existingBoomy = await prisma.user.findUnique({
    where: { email: boomyEmail },
  });

  if (!existingBoomy) {
    // Zufalls-Passwort — Boomy ist KI-Resident ohne Login-Pfad. Der Hash existiert
    // nur, weil das Schema ihn verlangt; niemand kennt oder braucht das Klartext.
    const boomyPasswordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);

    const boomy = await prisma.user.create({
      data: {
        username: boomyUsername,
        email: boomyEmail,
        passwordHash: boomyPasswordHash,
        role: 'KUENSTLER',
        displayName: 'Boomy',
        bio: "KBK's AI resident. Dropping Phonk beats and helping you make noise.",
      },
    });

    console.log(`✅ KI-Resident erstellt: ${boomy.username} (${boomy.email})`);
  } else {
    console.log(`ℹ️  KI-Resident existiert bereits: ${existingBoomy.username}`);
  }

  // === Site-Settings erstellen ===
  const existingSettings = await prisma.siteSettings.findUnique({
    where: { id: 'singleton' },
  });

  if (!existingSettings) {
    await prisma.siteSettings.create({
      data: {
        id: 'singleton',
        siteName: 'KaboomKartell',
        siteTagline: 'Digitales Musiklabel by 4Flow',
        heroTitle: 'Willkommen beim KBK!',
        heroSubtitle: 'Raggatek & Hardtek Community',
        aboutText:
          'Das KaboomKartell ist eine Community aus freien Künstlern mit Fokus auf Raggatek und Hardtek. Wir tun uns zusammen, um kranke Projekte zu veröffentlichen. Mach mit!',
        socialLinks: JSON.stringify({
          soundcloud: 'https://soundcloud.com/4-flow',
        }),
      },
    });

    console.log('✅ Site-Settings erstellt');
  } else {
    console.log('ℹ️  Site-Settings existieren bereits');
  }

  // === 4 KBK-Genre-Pools (Pool-Restrukturierung 16.05.2026) ===
  // Idempotent: wenn ein Pool mit dem slug schon existiert, wird er nicht überschrieben.
  let createdPools = 0;
  let existingPools = 0;

  for (const def of GENRE_POOL_DEFS) {
    const existing = await prisma.pool.findUnique({ where: { slug: def.slug } });

    if (!existing) {
      await prisma.pool.create({
        data: {
          slug: def.slug,
          name: def.name,
          description: def.description,
          genre: def.genre,
          isActive: true,
        },
      });
      createdPools++;
    } else {
      existingPools++;
    }
  }

  if (createdPools > 0) {
    console.log(`✅ ${createdPools} Genre-Pools angelegt`);
  }
  if (existingPools > 0) {
    console.log(`ℹ️  ${existingPools} Genre-Pools existierten bereits`);
  }

  console.log('🎉 Seeding abgeschlossen!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seeding fehlgeschlagen:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
