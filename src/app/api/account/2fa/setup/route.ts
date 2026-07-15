/**
 * POST /api/account/2fa/setup — Schritt 1: TOTP-Secret + QR-Code erzeugen
 *
 * Generiert ein neues TOTP-Secret und gibt die otpauth-URL zurück (für
 * QR-Code im UI). Das Secret wird VERSCHLUESSELT in DB gespeichert, aber
 * 2FA ist noch NICHT enabled — User muss erst /verify mit einem gueltigen
 * Code aufrufen.
 *
 * Wenn User bereits 2FA aktiv hat: 400-Error. Erst /disable, dann neu /setup.
 */

import { NextResponse } from 'next/server';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { encryptSecret } from '@/lib/auth-security';
import { logSecurityEvent } from '@/lib/security-log';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// 10 Setup-Starts pro Stunde pro IP (User können abbrechen + neu probieren).
const setupLimit = rateLimit({ interval: 3_600_000, maxKeys: 500 });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const ipCheck = setupLimit.check(`2fa-setup:${ip}`, 10);
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
      { success: false, error: '2FA already enabled. Disable first to re-setup.' },
      { status: 400 }
    );
  }

  // Neues Secret erzeugen (160 bits = 20 bytes, base32-encoded)
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: 'KaboomKartell',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  // Verschluesselt in DB speichern (noch NICHT enabled).
  // twoFactorMethod=totp setzen, damit nach Cross-Switch (User startet
  // Email-Setup, cancelt, startet TOTP-Setup) der Method-Wert konsistent ist.
  // Email-Felder löschen, falls noch Reste aus abgebrochenem Email-Setup
  // liegen — sonst würde /verify-email-setup fälschlich greifen.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecret: encryptSecret(secret.base32),
      twoFactorMethod: 'totp',
      twoFactorEmailCode: null,
      twoFactorEmailExpiry: null,
      // twoFactorEnabled bleibt false bis /verify
    },
  });

  await logSecurityEvent('2fa_setup_started', {
    userId: user.id,
    request,
  });

  // QR-Code als data-URL rendern (PNG, base64-eingebettet)
  const otpauthUrl = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    margin: 2,
    width: 256,
    color: { dark: '#0A0B0C', light: '#FFFFFF' },
  });

  return NextResponse.json({
    success: true,
    otpauthUrl,
    secretBase32: secret.base32,      // Manuelle Eingabe-Variante
    qrCodeDataUrl,                     // <img src={...}> direkt nutzbar
  });
}
