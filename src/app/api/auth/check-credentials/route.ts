/**
 * POST /api/auth/check-credentials — Pre-Flight-Check vor signIn()
 *
 * Prüfe Email+Password + signalisiere ob 2FA nötig ist. Erzeugt
 * KEINE Session. Wird vom Login-UI vor dem eigentlichen signIn()
 * aufgerufen, um zwischen 1-Step-Login und 2-Step-Login (mit TOTP)
 * zu unterscheiden.
 *
 * Sicherheits-Equivalent zu authorize() in auth.ts:
 * - IP-basiertes Rate-Limit
 * - Constant-Time-Compare bei nicht-existentem User
 * - Account-Lockout-Check
 * - Failed-Login-Counter
 *
 * Response 200: { ok: true, needs2FA: boolean }
 * Response 401: { ok: false, error: 'Email or password is incorrect.' }
 * Response 423: { ok: false, error: 'Account temporarily locked.' }
 * Response 429: { ok: false, error: 'Too many attempts. Slow down.' }
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import prisma from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import {
  loginRateLimit,
  isAccountLocked,
  computeLockoutUntil,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from '@/lib/auth-security';
import { logSecurityEvent } from '@/lib/security-log';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    loginIdentifier?: string;
    password?: string;
  };
  // v2.6: loginIdentifier kann Email oder Public Name (username) sein.
  // Backwards-Compat: alte Clients senden noch `email`.
  const identifier = (body.loginIdentifier ?? body.email ?? '').trim();
  const password = body.password;

  if (!identifier || !password) {
    return NextResponse.json(
      { ok: false, error: 'Email or public name and password required.' },
      { status: 400 }
    );
  }

  // IP-Rate-Limit (10/Min/IP)
  const ip = getClientIp(request);
  const ipCheck = loginRateLimit.check(`check:${ip}`, 10);
  if (!ipCheck.success) {
    await logSecurityEvent('login_rate_limited', { request });
    return NextResponse.json(
      { ok: false, error: 'Too many attempts. Slow down.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(ipCheck.resetMs / 1000)) } }
    );
  }

  // Identifier: wenn @ enthalten → Email-Lookup, sonst Username-Lookup.
  // Email wird lowercase normalisiert, Username-Lookup bleibt case-sensitive
  // (nutzt den DB-Wert wie eingegeben — Username ist [a-zA-Z0-9_-]+).
  const isEmail = identifier.includes('@');
  const user = isEmail
    ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } })
    : await prisma.user.findUnique({ where: { username: identifier } });

  if (!user) {
    // Constant-Time-Pattern: bcrypt-Compare trotzdem laufen lassen
    await bcrypt.compare(password, '$2b$12$dummyHashToPreventTimingAttack000000000000000000000');
    await logSecurityEvent('login_failed', {
      request,
      metadata: { reason: isEmail ? 'unknown_email' : 'unknown_username' },
    });
    return NextResponse.json(
      { ok: false, error: 'Email or password is incorrect.' },
      { status: 401 }
    );
  }

  if (!user.isActive) {
    await logSecurityEvent('login_failed', {
      userId: user.id,
      request,
      metadata: { reason: 'inactive' },
    });
    return NextResponse.json(
      { ok: false, error: 'Account is inactive.' },
      { status: 401 }
    );
  }

  if (isAccountLocked(user.lockedUntil)) {
    await logSecurityEvent('login_failed', {
      userId: user.id,
      request,
      metadata: { reason: 'locked', lockedUntil: user.lockedUntil },
    });
    return NextResponse.json(
      { ok: false, error: 'Account temporarily locked. Try again later.' },
      { status: 423 }
    );
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    const newAttempts = user.failedLoginAttempts + 1;
    const shouldLock = newAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    const lockUntil = shouldLock ? computeLockoutUntil() : null;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: newAttempts,
        lockedUntil: lockUntil,
      },
    });
    await logSecurityEvent('login_failed', {
      userId: user.id,
      request,
      metadata: { reason: 'wrong_password', failedAttempts: newAttempts },
    });
    if (shouldLock) {
      await logSecurityEvent('account_locked', {
        userId: user.id,
        request,
        metadata: { lockoutUntil: lockUntil, attempts: newAttempts },
      });
    }
    return NextResponse.json(
      { ok: false, error: 'Email or password is incorrect.' },
      { status: 401 }
    );
  }

  // Email+Password OK — nur signalisieren ob 2FA folgen muss.
  // Failed-Counter NICHT zurücksetzen — das passiert erst nach
  // erfolgreicher 2FA-Validation (oder wenn kein 2FA nötig) im
  // authorize()-Flow.
  return NextResponse.json({
    ok: true,
    needs2FA: user.twoFactorEnabled,
    twoFactorMethod: user.twoFactorEnabled ? user.twoFactorMethod : null,
  });
}
