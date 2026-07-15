/**
 * Admin Processes API — List
 *
 * GET /api/admin/processes?lang=en|de  (default: en)
 * Liefert alle Workflows aus dem Build-Time-Bundle, ohne body (nur Frontmatter + bodyEn-Verfügbarkeit).
 *
 * Audience-Filter: in der ersten Stufe ADMIN-only — sieht alles. Spätere
 * Stufen können über session.user.role + audience-Filter mehr Granularitaet bieten.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-api';
import { loadProcessesBundle, toProcessListItem } from '@/lib/processes-bundle';

export async function GET(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const TYPED_BUNDLE = loadProcessesBundle();

  const url = new URL(req.url);
  const lang = url.searchParams.get('lang') === 'de' ? 'de' : 'en';

  const items = TYPED_BUNDLE.processes.map((p) => toProcessListItem(p, lang));

  return NextResponse.json({
    success: true,
    lang,
    generatedAt: TYPED_BUNDLE.generatedAt,
    total: TYPED_BUNDLE.count,
    totalWithEn: TYPED_BUNDLE.countWithEn,
    items,
  });
}
