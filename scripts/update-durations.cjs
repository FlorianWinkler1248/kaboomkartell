#!/usr/bin/env node
/**
 * Backfill: echte MP3-Dauern in die DB schreiben — VBR-korrekt.
 *
 * v3 (16.07.2026): gleiche 3-Linien-Logik wie src/lib/mp3-duration.ts —
 *   1. Xing/Info-Frame-Count (Suche auf den ersten VALIDIERTEN Frame begrenzt),
 *   2. voller Frame-Walk ueber die ganze Datei (VBR OHNE Xing-Header —
 *      neue Suno-Encoder-Variante, Vorfall 16.07.2026),
 *   3. CBR-Schaetzung nur als Not-Fallback (kaputte Datei).
 * Frame-Sync wird validiert (Version/Layer/Indizes + Folge-Frame-Check).
 *
 * Standalone: nur better-sqlite3, kein Prisma/TS-Build noetig. Bei Aenderungen
 * an der Parsing-Logik IMMER src/lib/mp3-duration.ts mitziehen (und umgekehrt).
 *
 * Aufruf:
 *   node scripts/update-durations.cjs --dry   # nur Report, schreibt NICHTS
 *   node scripts/update-durations.cjs          # schreibt korrigierte Dauern
 *
 * Pfade via ENV (Defaults passen zur Server-Struktur "data/ neben repo/"):
 *   KBK_DB       Pfad zur SQLite-DB    (Default: ../../data/kaboomkartell.db)
 *   KBK_UPLOADS  Uploads-Verzeichnis   (Default: ../../data/uploads)
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DRY = process.argv.includes('--dry');
const DB_PATH = process.env.KBK_DB || path.resolve(__dirname, '..', '..', 'data', 'kaboomkartell.db');
const UPLOADS = process.env.KBK_UPLOADS || path.resolve(__dirname, '..', '..', 'data', 'uploads');

const MPEG1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
const READ = 256 * 1024;

/** Validierter Frame-Header-Parse (null = kein plausibler L3-Frame an off). */
function parseFrame(buf, off) {
  if (off + 4 > buf.length) return null;
  if (buf[off] !== 0xff || (buf[off + 1] & 0xe0) !== 0xe0) return null;
  const ver = (buf[off + 1] >> 3) & 0x03;
  const layer = (buf[off + 1] >> 1) & 0x03;
  if (ver === 1 || layer !== 1) return null;
  const bri = (buf[off + 2] >> 4) & 0x0f;
  const sri = (buf[off + 2] >> 2) & 0x03;
  if (bri === 0 || bri === 15 || sri === 3) return null;
  const isMpeg1 = ver === 3;
  const br = (isMpeg1 ? MPEG1 : MPEG2)[bri];
  const sr = SR[ver][sri];
  const spf = isMpeg1 ? 1152 : 576;
  const pad = (buf[off + 2] >> 1) & 0x01;
  const fl = Math.floor(((spf / 8) * br * 1000) / sr) + pad;
  if (fl < 24) return null;
  return { fl, secs: spf / sr, br, sr, spf };
}

function firstValidFrame(buf, start) {
  for (let off = start; off < buf.length - 4; off++) {
    const info = parseFrame(buf, off);
    if (!info) continue;
    const nxt = off + info.fl;
    if (nxt + 4 > buf.length || parseFrame(buf, nxt)) return { off, info };
  }
  return null;
}

function mp3Duration(filePath) {
  const fileSize = fs.statSync(filePath).size;
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(Math.min(READ, fileSize));
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const b = buf.subarray(0, n);

  let off = 0;
  if (b.length >= 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    off = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
  }
  const first = firstValidFrame(b, Math.min(off, b.length));
  if (!first) throw new Error('kein valider MPEG-Frame in ' + Math.round(READ / 1024) + 'KB');

  // 1. Xing/Info — muss im ersten Frame liegen.
  const frameEnd = Math.min(first.off + first.info.fl, b.length);
  for (const marker of ['Xing', 'Info']) {
    const xi = b.indexOf(marker, first.off, 'ascii');
    if (xi >= 0 && xi + 12 <= frameEnd) {
      const flags = b.readUInt32BE(xi + 4);
      if (flags & 0x0001) {
        const fc = b.readUInt32BE(xi + 8);
        if (fc > 0) return Math.round(((fc * first.info.spf) / first.info.sr) * 10) / 10;
      }
    }
  }

  // 2. Voller Frame-Walk (VBR ohne Header).
  const full = fs.readFileSync(filePath);
  let secs = 0;
  let frames = 0;
  let p = first.off;
  while (p < full.length - 4) {
    const info = parseFrame(full, p);
    if (info) {
      secs += info.secs;
      frames++;
      p += info.fl;
    } else {
      p++;
    }
  }
  if (frames >= 10) return Math.round(secs * 10) / 10;

  // 3. Not-Fallback: CBR-Schaetzung.
  return Math.round((((fileSize - first.off) * 8) / (first.info.br * 1000)) * 10) / 10;
}

const db = new Database(DB_PATH);
const rows = db.prepare("SELECT id,title,filePath,duration FROM tracks WHERE trackType='LOCAL' AND filePath IS NOT NULL").all();
const upd = db.prepare('UPDATE tracks SET duration=? WHERE id=?');

let changed = 0, ok = 0, err = 0;
console.log((DRY ? '[DRY-RUN] ' : '') + 'DB: ' + DB_PATH);
console.log('Uploads: ' + UPLOADS + ' | LOCAL-Tracks: ' + rows.length);
for (const t of rows) {
  const full = path.join(UPLOADS, t.filePath);
  if (!fs.existsSync(full)) { console.log('  [skip] Datei fehlt: ' + t.title); err++; continue; }
  let real;
  try { real = mp3Duration(full); } catch (e) { console.log('  [err] ' + t.title + ': ' + e.message); err++; continue; }
  const diff = Math.round((real - (t.duration || 0)) * 10) / 10;
  if (Math.abs(diff) >= 0.1) {
    console.log('  ' + (DRY ? '[would]' : '[update]') + ' ' + (diff > 0 ? '+' : '') + diff + 's | ' + t.duration + 's -> ' + real + 's | ' + t.title);
    if (!DRY) upd.run(real, t.id);
    changed++;
  } else ok++;
}
console.log('=== ' + (DRY ? 'DRY-RUN: ' : '') + changed + (DRY ? ' wuerden korrigiert' : ' korrigiert') + ', ' + ok + ' bereits korrekt, ' + err + ' Fehler/skip ===');
db.close();
