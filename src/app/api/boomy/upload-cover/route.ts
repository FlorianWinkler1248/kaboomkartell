/**
 * Boomy Cover-Upload Bridge
 *
 * POST /api/boomy/upload-cover
 *   Multipart-Form-Upload eines Covers vom externen Cover-Generator.
 *   Schreibt ins lokale Cover-Verzeichnis und gibt die KBK-URL zurück.
 *
 * Architektur-Hintergrund: Der Generator läuft in einem separaten Dienst ohne
 * geteiltes Volume — er erzeugt das PNG und pusht es per HTTP an KBK, das als
 * einziges die Datei über /api/uploads/... ausliefert.
 *
 * Auth: Authorization-Header == BOOMY_CONFIG.autoPublishSecret.
 *
 * Body: multipart/form-data mit Feld `file` (PNG/JPEG/WebP, max 5 MB)
 *
 * Returns: { url: '/api/uploads/covers/boomy-<hash>.<ext>' }
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { validateBoomySecret } from '@/lib/constants';
import { applyRateLimit, boomyLimit } from '@/lib/rate-limit';
import { detectImageMime } from '@/lib/mime-detect';

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const COVERS_DIR = path.join(process.cwd(), 'uploads', 'covers');

export async function POST(request: NextRequest) {
  // Rate-Limit als Defense-in-Depth zum Secret
  const limited = applyRateLimit(request, boomyLimit, 'boomy-cover', 60);
  if (limited) return limited;

  if (!validateBoomySecret(request.headers.get('Authorization'))) {
    return NextResponse.json(
      { success: false, error: 'Not authorized.' },
      { status: 403 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid multipart body.' },
      { status: 400 }
    );
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: 'Missing "file" field.' },
      { status: 400 }
    );
  }

  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      { success: false, error: `Unsupported MIME: ${file.type}` },
      { status: 400 }
    );
  }

  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: `File size out of range (1..${MAX_BYTES} bytes).` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Re-Check Buffer-Länge (file.size ist Client-self-reported)
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: `Buffer size out of range (1..${MAX_BYTES} bytes).` },
      { status: 400 }
    );
  }

  // Magic-Bytes vs deklariertem MIME — wenn nicht passend → ablehnen
  const detectedMime = detectImageMime(buffer);
  if (!detectedMime || detectedMime !== file.type) {
    return NextResponse.json(
      { success: false, error: `MIME mismatch (declared=${file.type}, magic-bytes=${detectedMime ?? 'unknown'}).` },
      { status: 400 }
    );
  }

  // Filename: trust nichts vom Client; immer hash + ext aus DETECTED MIME (nicht file.type)
  const ext = detectedMime === 'image/png' ? 'png' : detectedMime === 'image/webp' ? 'webp' : 'jpg';
  const hash = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const fileName = `boomy-${hash}.${ext}`;
  const absolutePath = path.join(COVERS_DIR, fileName);

  // Sicherstellen dass covers-Dir existiert (sollte aus Dockerfile schon da sein)
  if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
  }

  fs.writeFileSync(absolutePath, buffer);

  const url = `/api/uploads/covers/${fileName}`;

  return NextResponse.json({
    success: true,
    data: { url, fileName, size: buffer.length },
  });
}
