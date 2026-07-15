/**
 * MP3-Duration-Extraktion aus dem File-Header.
 *
 * Bestimmt die Spieldauer primaer aus dem **Xing/Info-VBR-Header**
 * (Frame-Anzahl x Samples-pro-Frame / Sample-Rate) — exakt fuer VBR
 * UND CBR. Faellt nur dann auf die fileSize/Bitrate-Schaetzung zurueck,
 * wenn kein Xing/Info-Header mit Frame-Count vorhanden ist (reines CBR
 * ohne Toc-Header).
 *
 * Hintergrund: Suno-Outputs sind **VBR**. Die fruehere reine CBR-Schaetzung
 * (fileSize / first-frame-bitrate) lag bei VBR um bis zu mehrere Minuten
 * daneben und verursachte Position-Drift in der Radio-Engine (Track wird
 * "mitten drin" gewechselt, weil der Server ihn fuer zu kurz/zu lang
 * haelt). Umstellung auf Xing-Frame-Count am 18.06.2026.
 *
 * Buffer-Groesse: 256KB. Suno-Tracks tragen grosse ID3-Tags mit Cover-Art
 * (PNG/JPEG bis ~200KB inline), die den ersten MPEG-Frame weit hinter die
 * initialen KB schieben.
 */

import fs from 'fs';

const HEADER_BUFFER_SIZE = 256 * 1024;

// MPEG Layer 3 Bitrate-Tabellen (kbps) — nur fuer den CBR-Fallback.
const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

// Sample-Rates (Hz) nach MPEG-Version-Bits (3=MPEG-1, 2=MPEG-2, 0=MPEG-2.5)
// und Sample-Rate-Index (Bits 2-3 von Byte 2 nach dem Sync).
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/**
 * Liest Duration (in Sekunden) aus einer MP3-Datei.
 * Wirft Error bei nicht-MP3 / kaputter Datei. Rueckgabewert ist
 * gerundet auf 1 Dezimalstelle (Sekunden).
 */
export function getMp3DurationFromPath(filePath: string): number {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  const readSize = Math.min(HEADER_BUFFER_SIZE, fileSize);
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(readSize);
  const bytesRead = fs.readSync(fd, buffer, 0, readSize, 0);
  fs.closeSync(fd);
  const header = buffer.subarray(0, bytesRead);

  // ID3v2-Tag ueberspringen (beginnt mit "ID3")
  let offset = 0;
  if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
    const tagSize =
      ((header[6] & 0x7f) << 21) |
      ((header[7] & 0x7f) << 14) |
      ((header[8] & 0x7f) << 7) |
      (header[9] & 0x7f);
    offset = 10 + tagSize;
  }

  // Ersten MPEG-Frame-Sync finden: 0xFF gefolgt von 0xE0+ (11 sync-bits)
  let syncOffset = offset;
  while (syncOffset < header.length - 4) {
    if (header[syncOffset] === 0xff && (header[syncOffset + 1] & 0xe0) === 0xe0) {
      break;
    }
    syncOffset++;
  }
  if (syncOffset >= header.length - 4) {
    throw new Error(`MPEG-Frame-Sync nicht in ersten ${Math.round(HEADER_BUFFER_SIZE / 1024)}KB gefunden`);
  }

  const byte1 = header[syncOffset + 1];
  const byte2 = header[syncOffset + 2];

  const versionBits = (byte1 >> 3) & 0x03; // 3=MPEG-1, 2=MPEG-2, 0=MPEG-2.5
  const isMpeg1 = versionBits === 0x03;
  const sampleRateIndex = (byte2 >> 2) & 0x03;
  const sampleRate = (SAMPLE_RATES[versionBits] ?? SAMPLE_RATES[3])[sampleRateIndex];
  const samplesPerFrame = isMpeg1 ? 1152 : 576;

  // Primaer: Xing/Info-Header (im ersten Audio-Frame) traegt die exakte
  // Frame-Anzahl — das ist die einzige korrekte Quelle fuer VBR.
  if (sampleRate) {
    let tagOffset = header.indexOf('Xing', syncOffset, 'ascii');
    if (tagOffset < 0) tagOffset = header.indexOf('Info', syncOffset, 'ascii');
    if (tagOffset >= 0 && tagOffset + 12 <= header.length) {
      const flags = header.readUInt32BE(tagOffset + 4);
      // Bit 0 = "frames"-Feld vorhanden
      if (flags & 0x0001) {
        const frameCount = header.readUInt32BE(tagOffset + 8);
        if (frameCount > 0) {
          const durationSeconds = (frameCount * samplesPerFrame) / sampleRate;
          return Math.round(durationSeconds * 10) / 10;
        }
      }
    }
  }

  // Fallback: CBR-Schaetzung aus der first-frame-Bitrate (nur korrekt,
  // wenn die Datei tatsaechlich CBR ohne Xing/Info-Header ist).
  const bitrateIndex = (byte2 >> 4) & 0x0f;
  const bitrateKbps = (isMpeg1 ? MPEG1_L3_BITRATES : MPEG2_L3_BITRATES)[bitrateIndex];
  if (!bitrateKbps) {
    throw new Error(`Invalid bitrate index ${bitrateIndex}`);
  }
  const audioBytes = fileSize - syncOffset;
  const durationSeconds = (audioBytes * 8) / (bitrateKbps * 1000);
  return Math.round(durationSeconds * 10) / 10;
}

/**
 * Versucht Duration zu lesen; gibt null bei Fehler zurück (statt zu werfen).
 * Für Use-Cases wo der Aufrufer mit fehlgeschlagener Extraction leben kann.
 */
export function tryGetMp3Duration(filePath: string): number | null {
  try {
    const d = getMp3DurationFromPath(filePath);
    return d > 0 ? d : null;
  } catch {
    return null;
  }
}
