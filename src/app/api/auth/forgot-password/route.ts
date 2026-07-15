/**
 * POST /api/auth/forgot-password — Password-Reset anfordern (Block D, v2.4)
 *
 * - User gibt Email ein.
 * - Wenn Account existiert: Reset-Token erzeugen, in DB speichern, Email senden.
 * - WENN ACCOUNT NICHT EXISTIERT: Selbe Erfolgs-Antwort. Kein User-Existenz-Leak.
 *
 * Rate-Limit: 3 Reset-Requests pro Stunde pro IP — gegen Email-Spam-Bots.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateResetToken } from '@/lib/auth-security';
import { sendMail, buildResetEmail } from '@/lib/mailer';
import { logSecurityEvent } from '@/lib/security-log';

const forgotLimit = rateLimit({ interval: 3_600_000, maxKeys: 1000 });

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };
  const email = body.email?.toLowerCase().trim();

  if (!email) {
    return NextResponse.json({ success: false, error: 'Email required.' }, { status: 400 });
  }

  // Rate-Limit: 3 Requests/h/IP
  const ip = getClientIp(request);
  const ipCheck = forgotLimit.check(`forgot:${ip}`, 3);
  if (!ipCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Too many reset requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(ipCheck.resetMs / 1000)) } }
    );
  }

  // Generic Success-Antwort, egal ob Account existiert oder nicht
  // (gegen User-Enumeration). Email wird nur gesendet wenn Account da.
  const genericSuccess = NextResponse.json({
    success: true,
    message: 'If an account exists for this email, a reset link has been sent.',
  });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    // Auch bei nicht-existenten Emails loggen (forensisch wichtig — wer
    // klopft hier am Account?). userId=null.
    await logSecurityEvent('password_reset_requested', {
      request,
      metadata: { knownEmail: false },
    });
    return genericSuccess;
  }

  const { token, expiry } = generateResetToken();
  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: token, resetTokenExpiry: expiry },
  });

  await logSecurityEvent('password_reset_requested', {
    userId: user.id,
    request,
    metadata: { knownEmail: true },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://kaboomkartell.com';
  const resetUrl = `${baseUrl}/reset-password/${encodeURIComponent(token)}`;
  const mail = buildResetEmail(resetUrl);

  try {
    await sendMail({ to: email, ...mail });
  } catch (err) {
    // Mailer-Fehler werden geloggt aber nicht als Status weitergereicht
    // (gegen User-Enumeration). User klickt einfach nochmal.
    console.error('[forgot-password] mailer failed:', err);
  }

  return genericSuccess;
}
