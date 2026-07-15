/**
 * Device-Code einlösen (P2.5 / ADR-035) — vom Agenten gepollt, KEIN Auth.
 *
 * POST /api/agent/token  Body: { deviceCode }
 *   → { status: 'pending' } solange der Mensch noch nicht bestätigt hat
 *   → { status: 'approved', token } GENAU EINMAL nach Bestätigung
 *   → 400 { status: 'expired' } bei unbekanntem/abgelaufenem Code
 *
 * Streng rate-limited. Der Klartext-PAT wird hier genau einmal ausgeliefert und der
 * Device-Code danach verworfen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit, rateLimit } from '@/lib/rate-limit';
import { pollDeviceCode } from '@/lib/device-code';

const tokenPollLimit = rateLimit({ interval: 60_000, maxKeys: 5000 });
const bodySchema = z.object({ deviceCode: z.string().min(1).max(200) });

export async function POST(request: NextRequest) {
  const limited = applyRateLimit(request, tokenPollLimit, 'agent-token', 60);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Validation error' }, { status: 400 });
  }

  const r = pollDeviceCode(parsed.data.deviceCode);
  if (r.status === 'expired') {
    return NextResponse.json(
      { success: false, status: 'expired', error: 'Device code expired or unknown.' },
      { status: 400 },
    );
  }
  if (r.status === 'pending') {
    return NextResponse.json({ success: true, status: 'pending' });
  }
  return NextResponse.json({ success: true, status: 'approved', token: r.token });
}
