/**
 * GET /api/account/me — Aktuelle User-Daten (für Settings-UI).
 *
 * Liefert nur die für Settings nötigen Felder, kein Password-Hash.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      displayName: true,
      twoFactorEnabled: true,
      twoFactorMethod: true,
      trustTier: true,
      emailVerified: true,
      newsletterOptIn: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, user });
}
