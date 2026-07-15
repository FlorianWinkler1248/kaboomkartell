/**
 * POST /api/account/2fa/verify-email-setup — Email-2FA-Setup bestaetigen (Block S, v2.7)
 *
 * - User gibt 6-stelligen OTP-Code ein
 * - Server verifiziert via bcrypt + Expiry-Check
 * - Bei OK: twoFactorEnabled=true, twoFactorMethod='email', generiert Backup-Codes
 * - Trust-Tier auf T2, tokenVersion bumpen
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import {
  generateBackupCodes,
  computeTrustTier,
  isEmailOtpValid,
} from '@/lib/auth-security';
import { logSecurityEvent } from '@/lib/security-log';
import { applyRateLimit, twoFactorLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  // OTP-Brute-Force bremsen (Defense-in-Depth zum kurzen Code-Raum), noch vor
  // Session-/DB-Zugriff.
  const limited = applyRateLimit(request, twoFactorLimit, '2fa-verify-setup', 5);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const body = (await request.json()) as { code?: string };
  const code = body.code?.trim();
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { success: false, error: 'Invalid code format. Expected 6 digits.' },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      twoFactorEnabled: true,
      twoFactorMethod: true,
      twoFactorEmailCode: true,
      twoFactorEmailExpiry: true,
      emailVerified: true,
    },
  });
  if (!user || user.twoFactorEnabled || user.twoFactorMethod !== 'email' || !user.twoFactorEmailCode) {
    return NextResponse.json(
      { success: false, error: 'No email-2FA setup pending. Run /setup-email first.' },
      { status: 400 }
    );
  }

  if (!isEmailOtpValid(user.twoFactorEmailExpiry)) {
    return NextResponse.json(
      { success: false, error: 'Code expired. Request a new one.' },
      { status: 400 }
    );
  }

  const ok = await bcrypt.compare(code, user.twoFactorEmailCode);
  if (!ok) {
    await logSecurityEvent('2fa_verify_failed', {
      userId: user.id,
      request,
      metadata: { context: 'setup', method: 'email' },
    });
    return NextResponse.json({ success: false, error: 'Invalid code.' }, { status: 400 });
  }

  const { plain, hashed } = await generateBackupCodes();
  const newTrustTier = computeTrustTier({
    emailVerified: user.emailVerified,
    twoFactorEnabled: true,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorMethod: 'email',
      twoFactorBackupCodes: JSON.stringify(hashed),
      twoFactorEmailCode: null,
      twoFactorEmailExpiry: null,
      trustTier: newTrustTier,
      // tokenVersion NICHT bumpen: 2FA-Setup ist kein Security-Incident.
      // Sonst kickt sich der User aus seiner eigenen Session.
      // Logout-all-Devices läuft über /api/auth/logout-all.
    },
  });

  await logSecurityEvent('2fa_enabled', {
    userId: user.id,
    request,
    metadata: { method: 'email', trustTier: newTrustTier },
  });

  return NextResponse.json({
    success: true,
    backupCodes: plain,
    trustTier: newTrustTier,
  });
}
