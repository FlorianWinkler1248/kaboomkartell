/**
 * File-Storage Abstraktion
 *
 * Phase 1: Lokales Dateisystem
 * Später: Drop-in Replacement für S3/MinIO möglich,
 * indem nur diese Datei ausgetauscht wird.
 */

import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/**
 * Stellt sicher, dass ein Verzeichnis existiert.
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Speichert eine Datei im Upload-Verzeichnis.
 *
 * @param buffer - Dateiinhalt als Buffer
 * @param subDir - Unterverzeichnis (z.B. "tracks", "covers")
 * @param fileName - Dateiname
 * @returns Relativer Pfad zur gespeicherten Datei
 */
export async function saveFile(
  buffer: Buffer,
  subDir: string,
  fileName: string
): Promise<string> {
  const dir = path.join(UPLOADS_DIR, subDir);
  ensureDir(dir);

  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, buffer);

  return path.join(subDir, fileName);
}

/**
 * Löscht eine Datei aus dem Upload-Verzeichnis.
 */
export async function deleteFile(relativePath: string): Promise<void> {
  const filePath = path.join(UPLOADS_DIR, relativePath);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Gibt den absoluten Pfad zu einer Datei zurück.
 */
export function getAbsolutePath(relativePath: string): string {
  return path.join(UPLOADS_DIR, relativePath);
}

/**
 * Prüft ob eine Datei existiert.
 */
export function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(UPLOADS_DIR, relativePath));
}

/**
 * Gibt die Dateigröße in Bytes zurück.
 */
export function getFileSize(relativePath: string): number {
  const filePath = path.join(UPLOADS_DIR, relativePath);
  const stats = fs.statSync(filePath);
  return stats.size;
}

/**
 * Erstellt einen ReadStream für Audio-Streaming.
 * Unterstützt Range-Requests für Seeking im Player.
 *
 * @param relativePath - Relativer Pfad zur Datei
 * @param start - Start-Byte (optional, für Range-Requests)
 * @param end - End-Byte (optional, für Range-Requests)
 */
export function createReadStream(
  relativePath: string,
  start?: number,
  end?: number
): fs.ReadStream {
  const filePath = path.join(UPLOADS_DIR, relativePath);
  const options: { start?: number; end?: number } = {};

  if (start !== undefined) options.start = start;
  if (end !== undefined) options.end = end;

  return fs.createReadStream(filePath, options);
}
