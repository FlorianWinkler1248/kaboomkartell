/**
 * Agent-Token-Verwaltung (P2.4 / ADR-035) — der Mensch erstellt/listet seine PATs.
 *
 * GET  /api/settings/agent-tokens        — eigene Tokens (ohne Hash, nur Anzeige-Prefix)
 * POST /api/settings/agent-tokens        — neuen PAT erstellen; Klartext GENAU EINMAL zurück
 *
 * Erstellen ist ein T1-Recht (Email verifiziert), analog Voten. Der Klartext wird nie
 * gespeichert — nur SHA-256-Hash (agent-auth.generateToken). userTokenVersion wird von
 * User.tokenVersion kopiert, sodass "Logout überall" den Token invalidiert.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { requireTier, PermissionError } from '@/lib/permissions';
import { generateToken } from '@/lib/agent-auth';

const ALLOWED_SCOPES = ['vote'] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(ALLOWED_SCOPES)).min(1).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authorized.' }, { status: 401 });
  }
  const tokens = await prisma.apiToken.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ success: true, tokens });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authorized.' }, { status: 401 });
  }
  const userId = session.user.id;

  // Token erstellen ist ein T1-Recht (Email verifiziert) — analog Voten.
  try {
    await requireTier(userId, 'T1');
  } catch (e) {
    if (e instanceof PermissionError) {
      return NextResponse.json(
        { success: false, error: 'Verify your email first (Trust Tier 1).' },
        { status: 403 },
      );
    }
    throw e;
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } });
  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
  }

  const { token, tokenHash, tokenPrefix } = generateToken();
  const scopes = (parsed.data.scopes ?? ['vote']).join(',');
  const created = await prisma.apiToken.create({
    data: { userId, tokenHash, tokenPrefix, name: parsed.data.name, scopes, userTokenVersion: user.tokenVersion },
    select: { id: true, name: true, tokenPrefix: true, scopes: true, createdAt: true },
  });

  // Klartext-Token GENAU EINMAL zurückgeben — danach ist nur der Hash bekannt.
  return NextResponse.json({ success: true, token, apiToken: created });
}
