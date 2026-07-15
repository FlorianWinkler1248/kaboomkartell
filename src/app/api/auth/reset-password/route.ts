/**
 * POST /api/auth/reset-password — Password-Reset durchführen (Block D, v2.4)
 *
 * Input: { token, newPassword }
 * Output: { success: true } oder Fehler.
 *
 * - Token-Lookup in DB
 * - Prüfung Expiry
 * - Password-Validation (>= 8 chars, mind. 1 Zahl)
 * - Hash + speichern, Token löschen
 * - failedLoginAttempts/lockedUntil reset (User kommt wieder rein)
 * - tokenVersion bump (alle existierenden Sessions invalidiert)
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import prisma from '@/lib/db';
import { isResetTokenValid, validatePasswordStrength } from '@/lib/auth-security';
import { logSecurityEvent } from '@/lib/security-log';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/rate-limit';

// 10 Reset-Confirms pro Stunde pro IP — gegen Brute-Force auf Reset-Token.
const resetLimit = rateLimit({ interval: 3_600_000, maxKeys: 1000 });

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const ipCheck = resetLimit.check(`reset-confirm:${ip}`, 10);
  if (!ipCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(ipCheck.resetMs / 1000)) } }
    );
  }

  const body = (await request.json()) as { token?: string; newPassword?: string };
  const token = body.token?.trim();
  const newPassword = body.newPassword;

  if (!token || !newPassword) {
    return NextResponse.json(
      { success: false, error: 'Token and new password required.' },
      { status: 400 }
    );
  }

  // Passwort-Policy v2.5
  const policyErrors = validatePasswordStrength(newPassword);
  if (policyErrors.length > 0) {
    return NextResponse.json(
      { success: false, error: policyErrors[0], details: policyErrors },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { resetToken: token } });
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Invalid or expired reset link.' },
      { status: 400 }
    );
  }

  if (!isResetTokenValid(user.resetTokenExpiry)) {
    // Token abgelaufen — Token aus DB entfernen
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: null, resetTokenExpiry: null },
    });
    return NextResponse.json(
      { success: false, error: 'Reset link has expired. Request a new one.' },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
    },
  });

  await logSecurityEvent('password_reset_completed', {
    userId: user.id,
    request,
  });

  return NextResponse.json({ success: true });
}
