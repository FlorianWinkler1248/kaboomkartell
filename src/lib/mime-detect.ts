/**
 * Magic-Bytes-Erkennung für Upload-Validierung (server-seitig).
 *
 * Prüft den TATSÄCHLICHEN Datei-Typ anhand der ersten Bytes statt dem
 * (client-kontrollierten) MIME-Header oder Dateinamen. Genutzt von den
 * Upload-Routen (boomy/upload-cover, admin/upload) als Defense-in-Depth gegen
 * getarnte Inhalte.
 */

/** Erkennt das Bild-MIME aus den Magic-Bytes (PNG/JPEG/WebP). null = unbekannt / kein Bild. */
export function detectImageMime(buffer: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buffer.length < 12) return null;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // WebP: 'RIFF' .... 'WEBP'
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Grobe MP3-Erkennung aus den Magic-Bytes: entweder ein ID3v2-Tag oder ein
 * MPEG-Audio-Frame-Sync. Kein vollständiger Codec-Parse — nur Schutz gegen
 * offensichtlich falsche Inhalte (z.B. HTML/JS als `.mp3` getarnt).
 */
export function looksLikeMp3(buffer: Buffer): boolean {
  if (buffer.length < 3) return false;
  // ID3v2-Tag: 'ID3'
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return true;
  // MPEG-Frame-Sync: 11 gesetzte Bits am Frame-Start (0xFF gefolgt von 0xEx/0xFx).
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;
  return false;
}
