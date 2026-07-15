/**
 * Agent-Token widerrufen (P2.4 / ADR-035).
 *
 * DELETE /api/settings/agent-tokens/[id] — setzt revokedAt (Soft-Revoke). Ab dann
 * lehnt agent-auth.authenticateBearer den Token ab. Nur eigene Tokens (Ownership im
 * updateMany-where erzwungen).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authorized.' }, { status: 401 });
  }
  const { id } = await params;

  const res = await prisma.apiToken.updateMany({
    where: { id, userId: session.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) {
    return NextResponse.json({ success: false, error: 'Token not found.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
