#!/usr/bin/env node
/**
 * Backfill: echte MP3-Dauern in die DB schreiben — VBR-korrekt via Xing-Header.
 *
 * Ersetzt das alte update-durations.ts (CBR-Annahme + veraltete Pfade), das fuer
 * die VBR-Suno-Tracks systematisch falsche Werte lieferte. Standalone: nur
 * better-sqlite3, kein Prisma/TS-Build noetig. Gleiche Berechnung wie
 * src/lib/mp3-duration.ts (Xing-Frame-Count, CBR-Fallback).
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

function mp3Duration(filePath) {
  const fileSize = fs.statSync(filePath).size;
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(Math.min(READ, fileSize));
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const b = buf.subarray(0, n);
  let off = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    off = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
  }
  let s = off;
  while (s < b.length - 4) { if (b[s] === 0xff && (b[s + 1] & 0xe0) === 0xe0) break; s++; }
  if (s >= b.length - 4) throw new Error('no MPEG sync in ' + Math.round(READ / 1024) + 'KB');
  const verBits = (b[s + 1] >> 3) & 0x03;
  const isMpeg1 = verBits === 3;
  const sampleRate = (SR[verBits] || SR[3])[(b[s + 2] >> 2) & 0x03];
  const spf = isMpeg1 ? 1152 : 576;
  if (sampleRate) {
    let xi = b.indexOf('Xing', s, 'ascii');
    if (xi < 0) xi = b.indexOf('Info', s, 'ascii');
    if (xi >= 0 && xi + 12 <= b.length) {
      const flags = b.readUInt32BE(xi + 4);
      if (flags & 0x0001) {
        const fc = b.readUInt32BE(xi + 8);
        if (fc > 0) return Math.round((fc * spf / sampleRate) * 10) / 10;
      }
    }
  }
  const br = (isMpeg1 ? MPEG1 : MPEG2)[(b[s + 2] >> 4) & 0x0f];
  if (!br) throw new Error('bad bitrate index');
  return Math.round(((fileSize - s) * 8 / (br * 1000)) * 10) / 10;
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
