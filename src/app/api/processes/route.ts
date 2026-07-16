/**
 * Public Processes API — List (Hilfe-Center)
 *
 * GET /api/processes?lang=en|de  (default: en)
 *
 * Öffentliches Gegenstück zu /api/admin/processes: liefert NUR Workflows, die
 * per Frontmatter-Audience `end-user` freigegeben sind (Filter server-seitig via
 * isPublicProcess — nie erst im Frontend). Interne Felder (module, tier, relPath …)
 * bleiben draußen. Kein Auth, aber rate-limited gegen Flood.
 */

import { NextResponse } from 'next/server';
import { applyRateLimit, publicProcessesLimit } from '@/lib/rate-limit';
import { loadProcessesBundle, toProcessListItem, isPublicProcess } from '@/lib/processes-bundle';

export async function GET(req: Request) {
  const limited = applyRateLimit(req, publicProcessesLimit, 'processes', 60);
  if (limited) return limited;

  const bundle = loadProcessesBundle();
  const url = new URL(req.url);
  const lang = url.searchParams.get('lang') === 'de' ? 'de' : 'en';

  const items = bundle.processes
    .filter(isPublicProcess)
    .map((p) => {
      const item = toProcessListItem(p, lang);
      // Nur die öffentlich relevanten Felder — module/tier/audiences sind intern.
      return {
        id: item.id,
        title: item.title,
        summary: item.summary,
        hasEn: item.hasEn,
        hasMermaid: item.hasMermaid,
        featured: item.featured,
      };
    })
    // Featured-Artikel (ADR-039) VOR die alphabetische Sortierung.
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.title.localeCompare(b.title));

  return NextResponse.json({ success: true, lang, items });
}
