/**
 * POST /api/account/2fa/verify — Schritt 2: TOTP-Code bestaetigen + 2FA enablen
 *
 * Erst-Verify: User scannt QR-Code, gibt 6-stelligen TOTP-Code ein,
 * dieser Endpoint validiert + setzt twoFactorEnabled=true + generiert
 * Backup-Codes (8 Stueck, einmalig dem User gezeigt). Trust-Tier
 * wird auf T2 gehoben.
 */

import { NextResponse } from 'next/server';
import * as OTPAuth from 'otpauth';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { decryptSecret, generateBackupCodes, computeTrustTier } from '@/lib/auth-security';
import { logSecurityEvent } from '@/lib/security-log';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const verifyLimit = rateLimit({ interval: 3_600_000, maxKeys: 500 });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  // 20 Verify-Versuche/h pro IP (User probieren mehrere Codes wenn TOTP-App driftet).
  const ip = getClientIp(request);
  const ipCheck = verifyLimit.check(`2fa-verify:${ip}`, 20);
  if (!ipCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Too many attempts. Slow down.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(ipCheck.resetMs / 1000)) } }
    );
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
      email: true,
      twoFactorSecret: true,
      twoFactorEnabled: true,
      emailVerified: true,
    },
  });

  if (!user || !user.twoFactorSecret) {
    return NextResponse.json(
      { success: false, error: 'No 2FA setup pending. Run /setup first.' },
      { status: 400 }
    );
  }

  if (user.twoFactorEnabled) {
    return NextResponse.json(
      { success: false, error: '2FA already enabled.' },
      { status: 400 }
    );
  }

  // TOTP-Code validieren
  const secret = decryptSecret(user.twoFactorSecret);
  const totp = new OTPAuth.TOTP({
    issuer: 'KaboomKartell',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) {
    await logSecurityEvent('2fa_verify_failed', {
      userId: user.id,
      request,
      metadata: { context: 'setup' },
    });
    return NextResponse.json({ success: false, error: 'Invalid 2FA code.' }, { status: 400 });
  }

  // 2FA aktivieren + Backup-Codes generieren
  const { plain, hashed } = await generateBackupCodes();
  const newTrustTier = computeTrustTier({
    emailVerified: user.emailVerified,
    twoFactorEnabled: true,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorMethod: 'totp',
      twoFactorBackupCodes: JSON.stringify(hashed),
      trustTier: newTrustTier,
      // tokenVersion NICHT bumpen: 2FA-Setup ist kein Security-Incident.
      // Wenn wir hier bumpen, kickt das den User aus seiner eigenen Session
      // (alle JWTs ungültig, inkl. der aktuelle). Logout-all-Devices läuft
      // über /api/auth/logout-all — das ist die richtige Stelle dafür.
    },
  });

  await logSecurityEvent('2fa_enabled', {
    userId: user.id,
    request,
    metadata: { trustTier: newTrustTier },
  });

  return NextResponse.json({
    success: true,
    backupCodes: plain, // Einmalig zurückgegeben - User muss speichern!
    trustTier: newTrustTier,
  });
}
