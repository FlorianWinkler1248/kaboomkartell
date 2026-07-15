/**
 * Users API Route
 *
 * POST /api/users - Registrierung (öffentlich)
 * GET  /api/users - User-Liste (nur Admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import prisma from '@/lib/db';
import { registerSchema } from '@/lib/validations';
import { auth } from '@/lib/auth';
import { applyRateLimit, registerLimit } from '@/lib/rate-limit';
import { logSecurityEvent } from '@/lib/security-log';
import { generateEmailVerifyToken } from '@/lib/auth-security';
import { sendMail, buildVerifyEmail } from '@/lib/mailer';

/**
 * POST /api/users - Neuen User registrieren
 */
export async function POST(request: NextRequest) {
  // Rate-Limit: 5 Registrierungen/h pro IP gegen Bot-Spam
  const limited = applyRateLimit(request, registerLimit, 'register', 5);
  if (limited) {
    await logSecurityEvent('register_rate_limited', { request });
    return limited;
  }

  try {
    const body = await request.json();

    // Validierung mit Zod
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      const reasons = Object.keys(result.error.flatten().fieldErrors);
      await logSecurityEvent('register_failed', {
        request,
        metadata: { reason: 'validation', fields: reasons },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { username, email, password, realName, newsletterOptIn } = result.data;
    // v2.6: Role wird NICHT mehr vom User-Input uebernommen.
    // Alle neuen User starten als MITGLIED — Promotion via Admin-Tooling.
    const role = 'MITGLIED';

    // Prüfen ob Username schon existiert
    const existingUsername = await prisma.user.findUnique({
      where: { username },
    });
    if (existingUsername) {
      await logSecurityEvent('register_failed', {
        request,
        metadata: { reason: 'username_taken', username },
      });
      return NextResponse.json(
        { success: false, error: 'This username is already taken.' },
        { status: 409 }
      );
    }

    // Prüfen ob Email schon existiert
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) {
      await logSecurityEvent('register_failed', {
        request,
        metadata: { reason: 'email_taken' },
      });
      return NextResponse.json(
        { success: false, error: 'This email address is already registered.' },
        { status: 409 }
      );
    }

    // Passwort hashen
    const passwordHash = await bcrypt.hash(password, 12);

    // v2.7: Email-Verification-Token + Trust-Tier T0 (Email unverified)
    const { token: verifyToken, expiry: verifyExpiry } = generateEmailVerifyToken();

    // User erstellen — startet als T0 (Email noch nicht verified).
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        role,
        realName,
        displayName: username,
        trustTier: 'T0',
        emailVerificationToken: verifyToken,
        emailVerificationExpiry: verifyExpiry,
        newsletterOptIn: newsletterOptIn === true,
        newsletterOptInAt: newsletterOptIn === true ? new Date() : null,
      },
    });

    // Verification-Email senden (fire-and-forget — bei Fehler kein Crash).
    const baseUrl = process.env.NEXTAUTH_URL ?? 'https://kaboomkartell.com';
    const verifyUrl = `${baseUrl}/verify-email/${encodeURIComponent(verifyToken)}`;
    const verifyMail = buildVerifyEmail(verifyUrl);
    try {
      await sendMail({ to: email, ...verifyMail });
    } catch (err) {
      console.error('[register] verify-email send failed:', err);
    }

    await logSecurityEvent('register_success', {
      userId: user.id,
      request,
      metadata: { role, trustTier: 'T0', newsletterOptIn: user.newsletterOptIn },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Registration successful!',
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/users - Alle User auflisten (nur Admin)
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        displayName: true,
        isActive: true,
        createdAt: true,
        // v2.27: Badges für Admin-User-Page Manage-Modal
        badges: {
          select: { type: true, grantedAt: true },
          orderBy: { grantedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('User list error:', error);
    return NextResponse.json(
      { success: false, error: 'Error loading user list.' },
      { status: 500 }
    );
  }
}
