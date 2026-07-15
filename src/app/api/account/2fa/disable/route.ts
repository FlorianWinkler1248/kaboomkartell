/**
 * POST /api/account/2fa/disable — 2FA deaktivieren (mit Passwort-Bestaetigung)
 *
 * Erfordert das aktuelle Passwort als Confirmation, damit jemand mit
 * gestohlener Session nicht einfach 2FA ausschalten kann.
 *
 * Nach Disable: twoFactorSecret + Backup-Codes werden gelöscht,
 * Trust-Tier sinkt auf T1, tokenVersion wird gebumpt (= Logout-all).
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { computeTrustTier } from '@/lib/auth-security';
import { logSecurityEvent } from '@/lib/security-log';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const disableLimit = rateLimit({ interval: 3_600_000, maxKeys: 500 });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  // Disable ist sensitiv — niedriger Limit (5/h/IP).
  const ip = getClientIp(request);
  const ipCheck = disableLimit.check(`2fa-disable:${ip}`, 5);
  if (!ipCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Too many attempts. Slow down.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(ipCheck.resetMs / 1000)) } }
    );
  }

  const body = (await request.json()) as { password?: string };
  const password = body.password;
  if (!password) {
    return NextResponse.json(
      { success: false, error: 'Password confirmation required.' },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      passwordHash: true,
      twoFactorEnabled: true,
      emailVerified: true,
    },
  });

  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  if (!user.twoFactorEnabled) {
    return NextResponse.json(
      { success: false, error: '2FA not enabled.' },
      { status: 400 }
    );
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json(
      { success: false, error: 'Incorrect password.' },
      { status: 400 }
    );
  }

  const newTrustTier = computeTrustTier({
    emailVerified: user.emailVerified,
    twoFactorEnabled: false,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorMethod: null,
      twoFactorEmailCode: null,
      twoFactorEmailExpiry: null,
      twoFactorBackupCodes: null,
      trustTier: newTrustTier,
      tokenVersion: { increment: 1 },
    },
  });

  await logSecurityEvent('2fa_disabled', {
    userId: user.id,
    request,
    metadata: { trustTier: newTrustTier },
  });

  return NextResponse.json({ success: true, trustTier: newTrustTier });
}
