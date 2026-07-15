/**
 * Device-Code bestätigen (P2.5 / ADR-035) — vom MENSCHEN aufgerufen (eingeloggt).
 *
 * GET  /api/agent/authorize?code=XXXX-XXXX  → { found, scopes, tokenName } (Anzeige vor Consent)
 * POST /api/agent/authorize  Body: { userCode } → erzeugt den PAT + markiert approved
 *
 * Erstellen eines Tokens ist ein T1-Recht (Email verifiziert). Der Klartext-PAT wird
 * NICHT hier zurückgegeben — er wird dem pollenden Agenten genau einmal ausgeliefert.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { requireTier, PermissionError } from '@/lib/permissions';
import { generateToken } from '@/lib/agent-auth';
import { lookupByUserCode, approveDeviceCode } from '@/lib/device-code';
import { applyRateLimit, rateLimit } from '@/lib/rate-limit';

const approveLimit = rateLimit({ interval: 60_000, maxKeys: 2000 });

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authorized.' }, { status: 401 });
  }
  const code = request.nextUrl.searchParams.get('code') ?? '';
  const entry = lookupByUserCode(code);
  if (!entry || entry.status === 'approved') {
    return NextResponse.json({ success: true, found: false });
  }
  return NextResponse.json({ success: true, found: true, scopes: entry.scopes, tokenName: entry.tokenName });
}

const bodySchema = z.object({ userCode: z.string().min(1).max(20) });

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authorized.' }, { status: 401 });
  }
  const limited = applyRateLimit(request, approveLimit, 'agent-authorize', 20);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Validation error' }, { status: 400 });
  }
  const userId = session.user.id;

  try {
    await requireTier(userId, 'T1');
  } catch (e) {
    if (e instanceof PermissionError) {
      return NextResponse.json({ success: false, error: 'Verify your email first (Trust Tier 1).' }, { status: 403 });
    }
    throw e;
  }

  const entry = lookupByUserCode(parsed.data.userCode);
  if (!entry) {
    return NextResponse.json({ success: false, error: 'Invalid or expired code.' }, { status: 404 });
  }
  if (entry.status === 'approved') {
    return NextResponse.json({ success: false, error: 'This code was already used.' }, { status: 409 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } });
  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
  }

  const { token, tokenHash, tokenPrefix } = generateToken();
  await prisma.apiToken.create({
    data: {
      userId,
      tokenHash,
      tokenPrefix,
      name: entry.tokenName,
      scopes: entry.scopes.join(','),
      userTokenVersion: user.tokenVersion,
    },
  });
  approveDeviceCode(parsed.data.userCode, userId, token);

  return NextResponse.json({ success: true, scopes: entry.scopes });
}
