/**
 * POST /api/auth/discord/disconnect (ADR-005 Sektion F)
 *
 * Trennt die Discord-Verlinkung des aktuell eingeloggten Users.
 * KBK-Master-Account bleibt unberührt, nur die LinkedAccount-Zeile geht weg.
 * Discord-seitige Token-Revoke ist optional — wir löschen sie hier nur lokal,
 * der User kann die App-Verbindung in seinen Discord-Einstellungen selbst
 * zurückziehen.
 *
 * Spiegelt 1:1 das Twitch-Muster (siehe ../twitch/disconnect).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { logSecurityEvent } from '@/lib/security-log';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated.' },
      { status: 401 }
    );
  }

  const deleted = await prisma.linkedAccount.deleteMany({
    where: { userId: session.user.id, provider: 'discord' },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ success: true, removed: 0 });
  }

  await logSecurityEvent('account_unlinked', {
    userId: session.user.id,
    request,
    metadata: { provider: 'discord', removed: deleted.count },
  });

  return NextResponse.json({ success: true, removed: deleted.count });
}
