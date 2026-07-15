/**
 * Admin Processes API — Detail
 *
 * GET /api/admin/processes/[id]?lang=en|de  (default: en)
 *
 * Liefert vollstaendigen Workflow inkl. Body. Path-Traversal-Schutz via
 * Regex-Whitelist. Wenn lang=en und kein bodyEn: wird DE-Body mit Lang-Marker
 * 'de-fallback' geliefert, damit das Frontend den Hinweis-Badge zeigen kann.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-api';
import { loadProcessesBundle, toProcessDetail } from '@/lib/processes-bundle';

const ID_PATTERN = /^[a-z0-9_-]+$/;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const TYPED_BUNDLE = loadProcessesBundle();

  const { id } = await params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ success: false, error: 'Invalid process id.' }, { status: 400 });
  }

  const url = new URL(req.url);
  const requested = url.searchParams.get('lang') === 'de' ? 'de' : 'en';

  const entry = TYPED_BUNDLE.processes.find((p) => p.id === id);
  if (!entry) {
    return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    process: toProcessDetail(entry, requested),
  });
}
