/**
 * GET /api/time — Server-Time-Endpoint (v2.6)
 *
 * Liefert die aktuelle Server-Zeit als UTC-ISO-String. Der Client nutzt das
 * beim Page-Mount um den Drift zwischen lokaler System-Uhr und Server-Uhr
 * zu berechnen — sinnvoll wenn der User-Laptop eine fehlerhafte Uhr hat
 * (NTP-Drift, manuell verstellt, etc.).
 *
 * No-Cache: Der Endpoint MUSS frische Server-Time liefern, sonst ist der
 * Drift-Wert wertlos.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      utc: new Date().toISOString(),
      epochMs: Date.now(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    }
  );
}
