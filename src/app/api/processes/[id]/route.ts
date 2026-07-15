/**
 * Public Processes API — Detail (Hilfe-Center)
 *
 * GET /api/processes/[id]?lang=en|de  (default: en)
 *
 * Öffentliches Gegenstück zu /api/admin/processes/[id]. Path-Traversal-Schutz via
 * Regex-Whitelist. Nicht-existente ODER nicht-öffentliche Workflows liefern das
 * IDENTISCHE 404 (kein Existenz-Orakel für interne Doku). Interne Felder (relPath,
 * relatedCode, relatedAdrs, validation, tier …) bleiben draußen. EN mit DE-Fallback
 * (actualLang='de-fallback') für den Hinweis-Badge im Frontend.
 */

import { NextResponse } from 'next/server';
import { applyRateLimit, publicProcessesLimit } from '@/lib/rate-limit';
import { loadProcessesBundle, toProcessDetail, isPublicProcess } from '@/lib/processes-bundle';

const ID_PATTERN = /^[a-z0-9_-]+$/;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = applyRateLimit(req, publicProcessesLimit, 'processes-detail', 60);
  if (limited) return limited;

  const { id } = await params;
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ success: false, error: 'Invalid process id.' }, { status: 400 });
  }

  const bundle = loadProcessesBundle();
  const url = new URL(req.url);
  const requested = url.searchParams.get('lang') === 'de' ? 'de' : 'en';

  const entry = bundle.processes.find((p) => p.id === id);
  if (!entry || !isPublicProcess(entry)) {
    return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
  }

  const detail = toProcessDetail(entry, requested);

  return NextResponse.json({
    success: true,
    process: {
      id: detail.id,
      title: detail.title,
      titleDe: detail.titleDe,
      summary: detail.summary,
      summaryDe: detail.summaryDe,
      hasEn: detail.hasEn,
      requestedLang: detail.requestedLang,
      actualLang: detail.actualLang,
      body: detail.body,
    },
  });
}
