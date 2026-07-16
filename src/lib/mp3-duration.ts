/**
 * MP3-Duration-Extraktion.
 *
 * Drei Verteidigungslinien (v3, 16.07.2026):
 *   1. **Xing/Info-VBR-Header** (Frame-Anzahl x Samples-pro-Frame / Sample-Rate)
 *      — exakt fuer VBR und CBR. Die Suche ist auf den ERSTEN validierten
 *      MPEG-Frame begrenzt (spezifikationsgemaess sitzt der Header dort),
 *      nicht mehr per indexOf ueber den ganzen Buffer.
 *   2. **Voller Frame-Walk** ueber die gesamte Datei, wenn kein Xing/Info
 *      vorhanden ist: alle Frame-Header abschreiten, Samples aufsummieren —
 *      exakt auch fuer VBR OHNE Header. Hintergrund: Suno liefert seit Juli
 *      2026 teils VBR-MP3s ohne Xing-Header, deren erster Frame 320 kbps
 *      traegt; die alte CBR-Schaetzung lag damit ~45% zu kurz und der
 *      Radio-Conductor brach Tracks mitten im Audio ab (Vorfall 16.07.2026,
 *      9 von 21 Uploads betroffen).
 *   3. **CBR-Schaetzung** (fileSize / first-frame-bitrate) nur noch als
 *      Not-Fallback, wenn der Walk keine plausible Frame-Zahl findet
 *      (kaputte Datei).
 *
 * Frame-Sync wird jetzt VALIDIERT (Version/Layer/Bitrate-Index/Sample-Rate-
 * Index plausibel + Folge-Frame-Check) — ein 0xFF-0xE0-Bitmuster in
 * ID3-Cover-Art kann nicht mehr als Frame missverstanden werden.
 *
 * Buffer-Groesse Schnellpfad: 256KB (grosse Suno-ID3-Tags mit Inline-Cover).
 * Der Frame-Walk liest die ganze Datei (Upload-Limit 50MB, reiner
 * Header-Hop ohne Decode — einstellige Millisekunden pro MB).
 */

import fs from 'fs';

const HEADER_BUFFER_SIZE = 256 * 1024;

// MPEG Layer 3 Bitrate-Tabellen (kbps). Index 0 (free) und 15 (bad) sind ungueltig.
const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

// Sample-Rates (Hz) nach MPEG-Version-Bits (3=MPEG-1, 2=MPEG-2, 0=MPEG-2.5)
// und Sample-Rate-Index (Bits 2-3 von Byte 2 nach dem Sync). Index 3 = reserved.
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/** Geparster, validierter MPEG-Layer-III-Frame-Header. */
interface FrameInfo {
  /** Frame-Laenge in Bytes (inkl. Header, inkl. Padding). */
  frameLength: number;
  /** Abspieldauer dieses Frames in Sekunden. */
  seconds: number;
  bitrateKbps: number;
  sampleRate: number;
  samplesPerFrame: number;
}

/**
 * Parst + validiert einen MPEG-Layer-III-Frame-Header an `off`.
 * `null` wenn dort kein plausibler Layer-III-Frame beginnt.
 */
function parseFrameHeader(buf: Buffer, off: number): FrameInfo | null {
  if (off + 4 > buf.length) return null;
  if (buf[off] !== 0xff || (buf[off + 1] & 0xe0) !== 0xe0) return null;

  const versionBits = (buf[off + 1] >> 3) & 0x03; // 3=MPEG-1, 2=MPEG-2, 0=MPEG-2.5, 1=reserved
  const layerBits = (buf[off + 1] >> 1) & 0x03; // 1 = Layer III
  if (versionBits === 1 || layerBits !== 1) return null;

  const bitrateIndex = (buf[off + 2] >> 4) & 0x0f;
  const sampleRateIndex = (buf[off + 2] >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;

  const isMpeg1 = versionBits === 3;
  const bitrateKbps = (isMpeg1 ? MPEG1_L3_BITRATES : MPEG2_L3_BITRATES)[bitrateIndex];
  const sampleRate = SAMPLE_RATES[versionBits][sampleRateIndex];
  const samplesPerFrame = isMpeg1 ? 1152 : 576;
  const padding = (buf[off + 2] >> 1) & 0x01;

  const frameLength = Math.floor(((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate) + padding;
  if (frameLength < 24) return null; // degenerierter Header

  return { frameLength, seconds: samplesPerFrame / sampleRate, bitrateKbps, sampleRate, samplesPerFrame };
}

/**
 * Sucht den ersten ECHTEN Frame ab `start`: Header muss validieren UND der
 * Folge-Frame an `off + frameLength` muss ebenfalls validieren (oder hinter
 * dem Buffer-Ende liegen). Filtert False-Syncs in Binaerdaten zuverlaessig.
 */
function findFirstValidFrame(buf: Buffer, start: number): { offset: number; info: FrameInfo } | null {
  for (let off = start; off < buf.length - 4; off++) {
    const info = parseFrameHeader(buf, off);
    if (!info) continue;
    const nextOff = off + info.frameLength;
    if (nextOff + 4 > buf.length || parseFrameHeader(buf, nextOff)) {
      return { offset: off, info };
    }
  }
  return null;
}

/** ID3v2-Tag-Ende bestimmen (0 wenn kein Tag). */
function id3End(buf: Buffer): number {
  if (buf.length < 10 || buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0;
  const tagSize =
    ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  return 10 + tagSize;
}

/**
 * Voller Frame-Walk: schreitet alle Frame-Header ab und summiert die
 * Abspieldauer. Exakt fuer VBR ohne Xing-Header. Nicht-Frame-Bytes
 * (Tag-Reste, Padding) werden byteweise uebersprungen.
 */
function walkAllFrames(buf: Buffer, start: number): { seconds: number; frames: number } {
  let seconds = 0;
  let frames = 0;
  let off = start;
  while (off < buf.length - 4) {
    const info = parseFrameHeader(buf, off);
    if (info) {
      seconds += info.seconds;
      frames++;
      off += info.frameLength;
    } else {
      off++;
    }
  }
  return { seconds, frames };
}

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

  const offset = id3End(header);
  const first = findFirstValidFrame(header, Math.min(offset, header.length));
  if (!first) {
    throw new Error(
      `Kein valider MPEG-Frame in ersten ${Math.round(HEADER_BUFFER_SIZE / 1024)}KB gefunden`,
    );
  }

  // 1. Schnellpfad: Xing/Info-Header — muss INNERHALB des ersten Frames liegen.
  const frameEnd = Math.min(first.offset + first.info.frameLength, header.length);
  for (const marker of ['Xing', 'Info'] as const) {
    const tagOffset = header.indexOf(marker, first.offset, 'ascii');
    if (tagOffset >= 0 && tagOffset + 12 <= frameEnd) {
      const flags = header.readUInt32BE(tagOffset + 4);
      // Bit 0 = "frames"-Feld vorhanden
      if (flags & 0x0001) {
        const frameCount = header.readUInt32BE(tagOffset + 8);
        if (frameCount > 0) {
          const durationSeconds = (frameCount * first.info.samplesPerFrame) / first.info.sampleRate;
          return Math.round(durationSeconds * 10) / 10;
        }
      }
    }
  }

  // 2. Kein Xing/Info → voller Frame-Walk ueber die gesamte Datei (VBR ohne Header).
  const full = fs.readFileSync(filePath);
  const walk = walkAllFrames(full, first.offset);
  if (walk.frames >= 10) {
    return Math.round(walk.seconds * 10) / 10;
  }

  // 3. Not-Fallback: CBR-Schaetzung aus der first-frame-Bitrate (kaputte Datei,
  //    Walk fand nichts Plausibles). Besser als gar kein Wert.
  const audioBytes = fileSize - first.offset;
  const durationSeconds = (audioBytes * 8) / (first.info.bitrateKbps * 1000);
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
