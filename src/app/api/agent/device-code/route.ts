/**
 * Device-Code starten (P2.5 / ADR-035) — vom Agenten aufgerufen, KEIN Auth.
 *
 * POST /api/agent/device-code  Body: { name?: string }
 *   → { userCode, deviceCode, scopes, expiresInSec, verificationUrl }
 *
 * Der Mensch tippt userCode auf verificationUrl ein; der Agent pollt mit deviceCode
 * an /api/agent/token. Streng rate-limited (Anti-Brute-Force).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit, rateLimit } from '@/lib/rate-limit';
import { createDeviceCode, DEVICE_CODE_TTL_SEC } from '@/lib/device-code';

const deviceCodeLimit = rateLimit({ interval: 60_000, maxKeys: 2000 });
const bodySchema = z.object({ name: z.string().trim().min(1).max(60).optional() });

export async function POST(request: NextRequest) {
  const limited = applyRateLimit(request, deviceCodeLimit, 'device-code', 10);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const name = parsed.success && parsed.data.name ? parsed.data.name : 'AI agent';
  const { userCode, deviceCode } = createDeviceCode(['vote'], name);
  const base = (process.env.NEXTAUTH_URL ?? 'https://kaboomkartell.com').replace(/\/$/, '');

  return NextResponse.json({
    success: true,
    userCode,
    deviceCode,
    scopes: ['vote'],
    expiresInSec: DEVICE_CODE_TTL_SEC,
    verificationUrl: `${base}/agent/authorize?ref=mcp`,
  });
}
