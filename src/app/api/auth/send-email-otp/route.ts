/**
 * POST /api/auth/send-email-otp — OTP zur Login-Authentifizierung anfordern (Block S, v2.7)
 *
 * Body: { loginIdentifier }
 * - Login-Flow Step 1.5: nach erfolgreichem check-credentials, wenn
 *   user.twoFactorMethod === 'email', triggert das UI diesen Endpoint
 * - Server generiert 6-stelligen OTP, hashed + speichert mit 10min-Expiry
 * - Sendet Mail an User-Email
 * - User gibt Code in /login Step 2 ein
 *
 * Generic Success — kein User-Existenz-Leak.
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import prisma from '@/lib/db';
import { generateEmailOtp, EMAIL_OTP_LIFETIME_MS } from '@/lib/auth-security';
import { sendMail, buildOtpEmail } from '@/lib/mailer';
import { logSecurityEvent } from '@/lib/security-log';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const otpLimit = rateLimit({ interval: 60_000, maxKeys: 1000 });

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const ipCheck = otpLimit.check(`send-otp:${ip}`, 5);
  if (!ipCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Too many OTP requests. Slow down.' },
      { status: 429 }
    );
  }

  const body = (await request.json()) as { loginIdentifier?: string };
  const identifier = body.loginIdentifier?.trim();
  if (!identifier) {
    return NextResponse.json(
      { success: false, error: 'Login identifier required.' },
      { status: 400 }
    );
  }

  const isEmail = identifier.includes('@');
  const user = isEmail
    ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } })
    : await prisma.user.findUnique({ where: { username: identifier } });

  // Generic Success — kein Leak ob User existiert oder welche Methode hinterlegt ist.
  const generic = NextResponse.json({ success: true, message: 'If applicable, a code has been sent.' });

  if (!user || !user.isActive || !user.twoFactorEnabled || user.twoFactorMethod !== 'email') {
    return generic;
  }

  const otp = generateEmailOtp();
  const hash = await bcrypt.hash(otp, 10);
  const expiry = new Date(Date.now() + EMAIL_OTP_LIFETIME_MS);
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEmailCode: hash, twoFactorEmailExpiry: expiry },
  });

  const mail = buildOtpEmail(otp);
  try {
    await sendMail({ to: user.email, ...mail });
  } catch (err) {
    console.error('[send-email-otp] mailer failed:', err);
  }

  await logSecurityEvent('2fa_email_sent', {
    userId: user.id,
    request,
  });

  return generic;
}
