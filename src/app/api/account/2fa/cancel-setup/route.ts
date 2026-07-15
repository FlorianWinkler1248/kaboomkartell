/**
 * POST /api/account/2fa/cancel-setup — Setup abbrechen + DB-Reste aufraeumen (v2.29)
 *
 * Wird vom UI gerufen, wenn der User mitten im 2FA-Setup auf "Back" / "Cancel"
 * klickt — z.B. TOTP-QR aufgerufen aber doch lieber Email-Code wollte.
 *
 * Wirkung NUR wenn `twoFactorEnabled === false`. Bei aktivem 2FA würde ein
 * unprivilegierter Cancel sonst ein verstecktes Disable bewirken — das ist
 * dem /disable-Endpoint mit Passwort-Confirm vorbehalten.
 *
 * Cleanup: twoFactorSecret, twoFactorEmailCode, twoFactorEmailExpiry,
 * twoFactorMethod werden geleert. Damit ist der DB-State sauber für einen
 * neuen Setup-Versuch (mit anderer Methode).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { logSecurityEvent } from '@/lib/security-log';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const cancelLimit = rateLimit({ interval: 3_600_000, maxKeys: 500 });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const ipCheck = cancelLimit.check(`2fa-cancel:${ip}`, 30);
  if (!ipCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Too many attempts. Slow down.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(ipCheck.resetMs / 1000)) } }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, twoFactorEnabled: true },
  });

  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  // Aktives 2FA NICHT via Cancel kippen — dafür ist /disable mit Passwort da.
  if (user.twoFactorEnabled) {
    return NextResponse.json(
      { success: false, error: '2FA is active. Use disable with password instead.' },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecret: null,
      twoFactorEmailCode: null,
      twoFactorEmailExpiry: null,
      twoFactorMethod: null,
    },
  });

  await logSecurityEvent('2fa_setup_cancelled', {
    userId: user.id,
    request,
  });

  return NextResponse.json({ success: true });
}
