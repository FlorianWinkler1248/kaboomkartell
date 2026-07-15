/**
 * POST /api/auth/logout-all — Logout-all-Devices (Block B, v2.4)
 *
 * Inkrementiert die tokenVersion des angemeldeten Users in der DB.
 * Der jwt-Callback schreibt die tokenVersion ins JWT beim Login —
 * Logout-all-Devices funktioniert pragmatisch so:
 *   - DB-tokenVersion wird inkrementiert.
 *   - Aktueller Token bleibt technisch valide bis maxAge (7 Tage),
 *     aber bei nächstem Login wird die neue Version vergeben.
 *   - API-Routes können tokenVersion gegen DB validieren via
 *     `await prisma.user.findUnique(...)` und `session.user.tokenVersion`.
 *   - Die aktuelle Session wird zusätzlich serverseitig invalidiert
 *     (Cookie wird über NextAuth's signOut zerstört).
 *
 * UX: User klickt "Sign out everywhere" → wird ausgeloggt + andere
 * Geräte fliegen beim nächsten gesicherten API-Call raus.
 */

import { NextResponse } from 'next/server';
import { auth, signOut } from '@/lib/auth';
import prisma from '@/lib/db';
import { logSecurityEvent } from '@/lib/security-log';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { tokenVersion: { increment: 1 } },
  });

  await logSecurityEvent('logout_all', {
    userId: session.user.id,
    request,
  });

  // Aktuellen Cookie invalidieren — User wird zur Login-Seite umgeleitet
  await signOut({ redirect: false });

  return NextResponse.json({ success: true });
}
