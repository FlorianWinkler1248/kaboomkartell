/**
 * Static File Serving für /api/uploads/<subdir>/<file>
 *
 * Streamt Dateien aus dem Upload-Volume (`/app/uploads/`).
 * Schutz gegen Path-Traversal: aufgelöster Pfad muss INNERHALB des
 * Upload-Roots bleiben. `..` in der URL wird abgewehrt.
 *
 * Wird genutzt für:
 *   - Boomy-generierte Cover (`/api/uploads/covers/boomy-*.png`)
 *   - Künftig: alle nutzergenerierten Cover
 *
 * Track-Audio läuft NICHT hierüber — dafür gibts den eigenen Stream-Endpoint
 * `/api/tracks/[id]/stream` mit Range-Request-Support und Play-Counter.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');

// SVG ist BEWUSST nicht enthalten: SVGs können <script>-Tags enthalten und
// würden bei serve-as-image im Cookie-Kontext der Domain XSS triggern.
// Wenn jemand künftig SVG-Cover braucht: separater Endpoint mit
// Content-Disposition: attachment + restrictiver CSP.
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Path-Traversal-Schutz: aufgelöster Pfad muss innerhalb UPLOADS_ROOT bleiben
  const requestedRel = segments.join('/');
  const absolute = path.resolve(UPLOADS_ROOT, requestedRel);
  if (!absolute.startsWith(UPLOADS_ROOT + path.sep) && absolute !== UPLOADS_ROOT) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ext = path.extname(absolute).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  const buffer = fs.readFileSync(absolute);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': mime,
      // 1 Tag Browser-Cache, immutable weil Filename Hash enthält
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
