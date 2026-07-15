/**
 * POST /api/account/2fa/setup-email — Email-2FA setup starten (Block S, v2.7)
 *
 * - User wählt "Email" als 2FA-Methode statt TOTP
 * - Server generiert 6-stelligen OTP, hashed + speichert mit 10min-Expiry
 * - Sendet OTP-Mail an User-Email
 * - User gibt Code in /verify-email-setup ein zur Bestaetigung
 *
 * KEIN twoFactorEnabled=true bis verify durchgegangen ist.
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { generateEmailOtp, EMAIL_OTP_LIFETIME_MS } from '@/lib/auth-security';
import { sendMail, buildOtpEmail } from '@/lib/mailer';
import { logSecurityEvent } from '@/lib/security-log';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const setupEmailLimit = rateLimit({ interval: 3_600_000, maxKeys: 500 });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const ipCheck = setupEmailLimit.check(`2fa-email-setup:${ip}`, 5);
  if (!ipCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Too many attempts. Slow down.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(ipCheck.resetMs / 1000)) } }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, twoFactorEnabled: true },
  });
  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }
  if (user.twoFactorEnabled) {
    return NextResponse.json(
      { success: false, error: '2FA already enabled. Disable first to switch method.' },
      { status: 400 }
    );
  }

  const otp = generateEmailOtp();
  const hash = await bcrypt.hash(otp, 10);
  const expiry = new Date(Date.now() + EMAIL_OTP_LIFETIME_MS);

  // twoFactorSecret löschen, falls Reste aus abgebrochenem TOTP-Setup liegen —
  // sonst könnte /verify (TOTP) bei einem späteren Aufruf fälschlich greifen.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorMethod: 'email',
      twoFactorEmailCode: hash,
      twoFactorEmailExpiry: expiry,
      twoFactorSecret: null,
      // twoFactorEnabled bleibt false bis verify
    },
  });

  const mail = buildOtpEmail(otp, 'setup');
  try {
    await sendMail({ to: user.email, ...mail });
  } catch (err) {
    console.error('[2fa-email-setup] mailer failed:', err);
  }

  await logSecurityEvent('2fa_setup_started', {
    userId: user.id,
    request,
    metadata: { method: 'email' },
  });

  return NextResponse.json({ success: true, message: 'Code sent to your email.' });
}
