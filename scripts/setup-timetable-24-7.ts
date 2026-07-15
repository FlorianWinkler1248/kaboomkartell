/**
 * Setup-Script: 24/7-Sendeplan + wiederkehrendes Freitag-Live-Event (ADR-028)
 *
 * Ersetzt den kompletten Wochen-Sendeplan durch die 2h-Raster-Rotation:
 *   - phonk-Channel (24/7): alterniert alle 2h Phonk (rot) / Brazilian Phonk (grün)
 *   - hardtek-Channel: "Hardphonk" (Hardtek-Pool) parallel zu den Phonk-Fenstern
 *   - LIVE-Channel: wiederkehrendes Twitch-Event jeden Freitag 18:00–20:00 UTC
 *
 * Zeiten sind UTC (KBK-Server läuft in Etc/UTC; die Radio-Engine rechnet mit der
 * lokalen = UTC-Stunde). IDEMPOTENT: löscht erst alle Slots + wiederkehrenden
 * Events, legt dann frisch an — mehrfaches Ausführen ergibt denselben Endzustand.
 *
 * Sendeplan-Abwechslung (Folge-Session auf ADR-028, kein neues ADR — TimetableSlot
 * bleibt strukturell unverändert, radio.ts/radio-state.ts unberührt): das reine 2h-
 * Raster wiederholte sich bisher jeden Wochentag IDENTISCH (Phonk immer auf geraden,
 * Brazilian immer auf ungeraden 2h-Blöcken; Hardphonk deckungsgleich mit Phonk). Pro
 * Wochentag wird jetzt deterministisch (SEASON_SEED + Wochentag, reproduzierbar via
 * `seededShuffle` aus radio.ts — kein neuer PRNG) je ein 2h-Phasenversatz gewürfelt:
 *   - phonk-Channel: 0 = Phonk führt (wie bisher), 2 = Brazilian führt (vertauscht)
 *     — reiner Phasenversatz, die 2h-Kachelung bleibt lückenlos + überlappungsfrei.
 *   - hardtek-Channel: eigener, von phonk UNABHÄNGIGER Versatz — Hardphonk lief bisher
 *     stur deckungsgleich mit den Phonk-Fenstern; jetzt mal mit Phonk-, mal mit
 *     Brazilian-Stunden überlappend, je Wochentag.
 * SEASON_SEED von Hand bumpen, um die Rotation bewusst neu zu würfeln (bleibt bis
 * dahin über beliebig viele Skript-Läufe reproduzierbar — Pflicht für /schedule,
 * MCP get_schedule, Timetable-API: 24h-Vorschau bleibt ein vorab bekannter Plan).
 *
 * ⚠️ Ersetzt den Live-Sendeplan vollständig. VORHER DB-Backup ziehen.
 *
 * Ausführen (Server, am Migrations-Gate nach `prisma generate`):
 *   pnpm tsx scripts/setup-timetable-24-7.ts
 * Twitch-URL überschreibbar via KBK_FRIDAY_STREAM_URL.
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { SEASON_SEED, buildWeekSlots } from '../src/lib/timetable-rotation';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
});
const prisma = new PrismaClient({ adapter });

const FRIDAY_TITLE = 'KBK Friday Live';
const TWITCH_URL = process.env.KBK_FRIDAY_STREAM_URL || 'https://www.twitch.tv/kbk4flow';
const FRIDAY = 5; // Date.getDay(): 0=So .. 5=Fr

// 2h-Raster (Start-Stunden, UTC) — Basis-Anker, siehe Abwechslungs-Kommentar oben.
// Die eigentliche Wochentags-Rotation (Phasenversatz + Determinismus-Garantie) steckt
// in src/lib/timetable-rotation.ts (pure, testbar ohne DB).
const PHONK_START_HOURS = [0, 4, 8, 12, 16, 20]; // Phonk (rot)
const BRAZILIAN_START_HOURS = [2, 6, 10, 14, 18, 22]; // Brazilian Phonk (grün)
const HARDPHONK_START_HOURS = [0, 4, 8, 12, 16, 20]; // Hardphonk-Basis (deckt sich mit Phonk)

async function main() {
  console.log('=== setup-timetable-24-7 (ADR-028) ===');

  // 1) Genre-Pools holen
  const pools = await prisma.pool.findMany({
    where: { slug: { in: ['phonk', 'brazilian-phonk', 'hardtek'] } },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(pools.map((p) => [p.slug, p.id]));
  const phonkId = bySlug.get('phonk');
  const brazilianId = bySlug.get('brazilian-phonk');
  const hardtekId = bySlug.get('hardtek');
  const missing = ['phonk', 'brazilian-phonk', 'hardtek'].filter((s) => !bySlug.get(s));
  if (missing.length > 0) {
    throw new Error(`Pools fehlen (slug): ${missing.join(', ')} — erst seed/Pools anlegen.`);
  }

  // 2) Alten Sendeplan sichern (Log) + löschen — wird vollständig ersetzt.
  const oldSlots = await prisma.timetableSlot.findMany({
    select: { dayOfWeek: true, startHour: true, endHour: true, label: true },
  });
  console.log(`Alte Slots: ${oldSlots.length} (werden gelöscht — DB-Backup vorausgesetzt!)`);
  await prisma.timetableSlot.deleteMany({});

  // 3) Neue Rotation — pro Wochentag mit eigenem, deterministisch gewürfeltem
  //    Phasenversatz (SEASON_SEED), statt 7× identischem Raster.
  const rows = buildWeekSlots(
    phonkId!,
    brazilianId!,
    hardtekId!,
    PHONK_START_HOURS,
    BRAZILIAN_START_HOURS,
    HARDPHONK_START_HOURS,
  );
  await prisma.timetableSlot.createMany({ data: rows });
  console.log(
    `Neue Slots angelegt: ${rows.length} (SEASON_SEED="${SEASON_SEED}", ` +
      `${PHONK_START_HOURS.length + BRAZILIAN_START_HOURS.length + HARDPHONK_START_HOURS.length} Slots/Tag × 7 Tage).`,
  );

  // 4) Wiederkehrendes Twitch-Event (Fr 18–20 UTC). Idempotent: vorhandene
  //    wiederkehrende Events vorher entfernen (einmalige bleiben unangetastet).
  const removedRecurring = await prisma.timetableEvent.deleteMany({
    where: { recurringDayOfWeek: { not: null } },
  });
  if (removedRecurring.count > 0) {
    console.log(`Alte wiederkehrende Events entfernt: ${removedRecurring.count}`);
  }
  // Nur die Uhrzeit aus startTime/endTime zählt (recurringDayOfWeek steuert den Tag).
  await prisma.timetableEvent.create({
    data: {
      title: FRIDAY_TITLE,
      description: '4Flow live on Twitch — every Friday 18:00–20:00 UTC.',
      startTime: new Date(Date.UTC(2026, 0, 2, 18, 0, 0)),
      endTime: new Date(Date.UTC(2026, 0, 2, 20, 0, 0)),
      eventType: 'TWITCH',
      streamUrl: TWITCH_URL,
      recurringDayOfWeek: FRIDAY,
      poolId: null,
    },
  });
  console.log(`Twitch-Event angelegt: "${FRIDAY_TITLE}" Fr 18:00–20:00 UTC → ${TWITCH_URL}`);

  console.log('=== fertig ===');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ setup-timetable-24-7 fehlgeschlagen:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
