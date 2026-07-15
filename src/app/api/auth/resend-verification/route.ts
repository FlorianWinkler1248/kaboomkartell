/**
 * POST /api/auth/resend-verification — Verify-Email neu zustellen (Block O, v2.7)
 *
 * Body: { email }
 * - Generic Success-Response (kein User-Existenz-Leak)
 * - Wenn User existiert + nicht verified: Token regenerieren + Mail senden
 * - Rate-Limit: 3/h/IP
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { generateEmailVerifyToken } from '@/lib/auth-security';
import { sendMail, buildVerifyEmail } from '@/lib/mailer';
import { logSecurityEvent } from '@/lib/security-log';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const resendLimit = rateLimit({ interval: 3_600_000, maxKeys: 1000 });

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const ipCheck = resendLimit.check(`resend-verify:${ip}`, 3);
  if (!ipCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Try again later.' },
      { status: 429 }
    );
  }

  const body = (await request.json()) as { email?: string };
  const email = body.email?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json(
      { success: false, error: 'Email required.' },
      { status: 400 }
    );
  }

  const genericSuccess = NextResponse.json({
    success: true,
    message: 'If an unverified account exists for this email, a new link has been sent.',
  });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.emailVerified) {
    return genericSuccess;
  }

  const { token, expiry } = generateEmailVerifyToken();
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerificationToken: token, emailVerificationExpiry: expiry },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://kaboomkartell.com';
  const verifyUrl = `${baseUrl}/verify-email/${encodeURIComponent(token)}`;
  const mail = buildVerifyEmail(verifyUrl, true);
  try {
    await sendMail({ to: email, ...mail });
  } catch (err) {
    console.error('[resend-verification] mailer failed:', err);
  }

  await logSecurityEvent('email_verification_resent', {
    userId: user.id,
    request,
  });

  return genericSuccess;
}
