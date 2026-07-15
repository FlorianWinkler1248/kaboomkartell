/**
 * POST /api/auth/verify-email — Email-Verification durchführen (Block O, v2.7)
 *
 * Body: { token }
 * - Token-Lookup, Expiry-Check
 * - emailVerified = NOW(), Token löschen
 * - Trust-Tier T0 -> T1 (oder T2 wenn 2FA bereits drauf)
 * - Audit: email_verified
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { isEmailVerifyTokenValid, computeTrustTier } from '@/lib/auth-security';
import { logSecurityEvent } from '@/lib/security-log';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const verifyLimit = rateLimit({ interval: 3_600_000, maxKeys: 1000 });

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const ipCheck = verifyLimit.check(`verify-email:${ip}`, 20);
  if (!ipCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Too many attempts. Slow down.' },
      { status: 429 }
    );
  }

  const body = (await request.json()) as { token?: string };
  const token = body.token?.trim();

  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Verification token required.' },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { emailVerificationToken: token } });
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Invalid or expired verification link.' },
      { status: 400 }
    );
  }

  if (!isEmailVerifyTokenValid(user.emailVerificationExpiry)) {
    // Token abgelaufen — User kann über /api/auth/resend-verification neu anfordern
    return NextResponse.json(
      { success: false, error: 'Verification link expired. Request a new one.', expired: true },
      { status: 400 }
    );
  }

  if (user.emailVerified) {
    // Idempotent: schon verified — als Erfolg behandeln
    return NextResponse.json({ success: true, alreadyVerified: true });
  }

  const newTrustTier = computeTrustTier({
    emailVerified: new Date(),
    twoFactorEnabled: user.twoFactorEnabled,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: new Date(),
      emailVerificationToken: null,
      emailVerificationExpiry: null,
      trustTier: newTrustTier,
    },
  });

  await logSecurityEvent('email_verified', {
    userId: user.id,
    request,
    metadata: { trustTier: newTrustTier },
  });

  return NextResponse.json({ success: true, trustTier: newTrustTier });
}
