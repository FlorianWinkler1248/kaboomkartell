import { NextResponse } from 'next/server';
import canon from '@/data/multiverse-canon.json';

/**
 * GET /api/kbk/canon
 *
 * Liefert den kuratierten Kanon-Slice des KBK-Song-Multiversums —
 * den Möglichkeitsraum (Kosmologie + Regeln der Klassen S/M/T + versiegelte
 * Zonen), NICHT fertige Geschichten. Einzige öffentliche Laufzeit-Quelle des
 * Kanons (ADR-037); der kbk-mcp (Tool get_multiverse) proxied diese Route.
 *
 * Kuratierung passiert beim Erstellen von src/data/multiverse-canon.json
 * (Klasse V erreicht die Response nie — Guard: src/data/__tests__/).
 * Read-only by design: kein POST, kein Rückkanal (ADR-036).
 *
 * Workflow: kbk-multiversum-kanon · SoT des Kanons: kbk-brain/kanon/ (privat).
 */

// Statischer Content — darf beim Build eingefroren werden; Updates kommen
// ausschließlich über neue Deploys (bewusst: Kanon-Änderungen sind selten).
export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(canon, {
    headers: {
      // Browser 5 min, CDN/Proxy 1 h — Kanon ändert sich nur per Deploy.
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
