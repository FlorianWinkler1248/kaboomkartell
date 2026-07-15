/**
 * Einmal-Migration: Pool-Restrukturierung (16.05.2026).
 *
 * Hängt die Bestandstracks in die 4 Genre-Pools um, verdrahtet die
 * Timetable-Slots/Events neu und entfernt die Alt-Pools (alte 9-Pool-Matrix
 * src-* + die Playback-Pools dark-phonk-stories / hardphonk).
 *
 * Läuft NACH der Prisma-Migration 20260516120000_pool_restructure (die
 * Track.isPublic aus dem alten status ableitet) und NACH dem Seed (der die
 * 4 Genre-Pools phonk/hardtek/raggatek/brazilian-phonk anlegt).
 *
 * Idempotent: ein zweiter Lauf findet keine Alt-Pools mehr und tut nichts.
 * Transaktional: bei einem Fehler wird komplett zurückgerollt.
 *
 * Lauf auf Prod (im Container):
 *   node scripts/migrate-pool-restructure.js   (auf dem Server, DATABASE_URL gesetzt)
 */
const Database = require('better-sqlite3');

const DB_PATH = process.env.KBK_DB_PATH || '/app/data/kaboomkartell.db';
const KEEP_SLUGS = ['phonk', 'hardtek', 'raggatek', 'brazilian-phonk'];

const db = new Database(DB_PATH);
const log = (m) => console.log('[pool-restructure] ' + m);

const run = db.transaction(() => {
  // 1. Track-Genre-Casing auf die 4 kanonischen Genres normalisieren.
  const genreFixes = [
    ['phonk', 'Phonk'],
    ['hardtek', 'Hardtek'],
    ['raggatek', 'Raggatek'],
    ['frenchcore', 'Hardtek'],
    ['Frenchcore', 'Hardtek'],
    ['Tribe', 'Hardtek'],
  ];
  for (const [from, to] of genreFixes) {
    const n = db.prepare('UPDATE tracks SET genre = ? WHERE genre = ?').run(to, from).changes;
    if (n > 0) log(`Genre "${from}" -> "${to}": ${n} Track(s)`);
  }

  // 2. Die 4 Genre-Pools müssen existieren (vom Seed angelegt).
  const targets = {};
  for (const slug of KEEP_SLUGS) {
    const row = db.prepare('SELECT id, genre FROM pools WHERE slug = ?').get(slug);
    if (!row) throw new Error(`Genre-Pool "${slug}" fehlt — lief der Seed?`);
    targets[(row.genre || '').toLowerCase()] = row.id;
  }

  // 3. Alt-Pools (KBK-eigene, ownerArtistId NULL) auf den passenden Genre-Pool
  //    mappen: Slots/Events/PoolTracks umhängen, dann Alt-Pool löschen.
  const placeholders = KEEP_SLUGS.map(() => '?').join(',');
  const oldPools = db.prepare(
    `SELECT id, slug, genre FROM pools WHERE ownerArtistId IS NULL AND slug NOT IN (${placeholders})`
  ).all(...KEEP_SLUGS);

  for (const op of oldPools) {
    const targetId = targets[(op.genre || '').toLowerCase()];
    if (!targetId) {
      log(`WARNUNG: Alt-Pool "${op.slug}" (genre=${op.genre}) hat kein Ziel-Genre — übersprungen, NICHT gelöscht`);
      continue;
    }
    const slots = db
      .prepare('UPDATE timetable_slots SET poolId = ? WHERE poolId = ?')
      .run(targetId, op.id).changes;
    const events = db
      .prepare('UPDATE timetable_events SET poolId = ? WHERE poolId = ?')
      .run(targetId, op.id).changes;
    // Duplikate vermeiden: Tracks, die schon im Ziel-Pool sind, aus dem
    // Alt-Pool entfernen (sonst kollidiert das @@unique([poolId, trackId])).
    db.prepare(
      'DELETE FROM pool_tracks WHERE poolId = ? AND trackId IN (SELECT trackId FROM pool_tracks WHERE poolId = ?)'
    ).run(op.id, targetId);
    const tracks = db
      .prepare('UPDATE pool_tracks SET poolId = ? WHERE poolId = ?')
      .run(targetId, op.id).changes;
    db.prepare('DELETE FROM pools WHERE id = ?').run(op.id);
    log(`"${op.slug}" -> Genre-Pool: ${slots} Slot(s), ${events} Event(s), ${tracks} Track(s) umgehängt, Alt-Pool gelöscht`);
  }
});

try {
  run();
  log('Migration erfolgreich abgeschlossen.');
  const poolsAfter = db
    .prepare(
      'SELECT p.slug, p.genre, COUNT(pt.id) AS tracks FROM pools p LEFT JOIN pool_tracks pt ON pt.poolId = p.id GROUP BY p.id ORDER BY p.slug'
    )
    .all();
  log('Pools nachher: ' + JSON.stringify(poolsAfter));
  const slotsAfter = db
    .prepare(
      'SELECT p.slug, COUNT(*) AS c FROM timetable_slots s JOIN pools p ON p.id = s.poolId GROUP BY p.slug ORDER BY p.slug'
    )
    .all();
  log('Slots nachher: ' + JSON.stringify(slotsAfter));
  const pub = db.prepare('SELECT isPublic, COUNT(*) AS c FROM tracks GROUP BY isPublic').all();
  log('Tracks nach isPublic: ' + JSON.stringify(pub));
} catch (err) {
  console.error('[pool-restructure] FEHLER — Transaktion zurückgerollt: ' + err.message);
  process.exit(1);
} finally {
  db.close();
}
