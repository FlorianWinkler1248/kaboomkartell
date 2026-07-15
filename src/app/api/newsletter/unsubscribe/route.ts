/**
 * Newsletter-Abmeldung per signiertem Ein-Klick-Link (P1.1 / ADR-035).
 *
 * GET /api/newsletter/unsubscribe?uid=<userId>&sig=<hmac>
 *
 * Kommt aus dem Footer jeder Broadcast-Mail. Kein Login: die HMAC-Signatur beweist,
 * dass der Link für genau diese userId ausgestellt wurde. Setzt newsletterOptIn=false
 * und zeigt eine schlichte Bestätigungs-Seite (self-contained HTML, keine Session/Locale).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyUnsubscribe } from '@/lib/newsletter';

function confirmPage(headline: string, body: string, ok: boolean): NextResponse {
  const accent = ok ? '#3FCF4A' : '#E63B2E';
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KaboomKartell</title></head>
<body style="margin:0;padding:48px 16px;background:#0A0B0C;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="max-width:440px;margin:0 auto;background:#121315;border:1px solid ${accent}55;padding:32px;" cellspacing="0" cellpadding="0">
    <tr><td>
      <h1 style="color:${accent};font-size:16px;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 20px;">KABOOMKARTELL</h1>
      <p style="color:#fff;font-size:17px;line-height:1.5;margin:0 0 12px;font-weight:700;">${headline}</p>
      <p style="color:rgba(255,255,255,0.6);font-size:14px;line-height:1.6;margin:0;">${body}</p>
    </td></tr>
  </table>
</body>
</html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get('uid') ?? '';
  const sig = request.nextUrl.searchParams.get('sig') ?? '';

  if (!verifyUnsubscribe(uid, sig)) {
    return confirmPage(
      'Invalid link',
      'this unsubscribe link is invalid or has expired. if you keep getting emails you did not sign up for, reach out to us.',
      false,
    );
  }

  try {
    await prisma.user.update({ where: { id: uid }, data: { newsletterOptIn: false } });
  } catch {
    // User evtl. gelöscht — idempotent: der Link war gültig signiert, also Erfolg zeigen.
  }

  return confirmPage(
    "You're unsubscribed",
    'you will no longer get KaboomKartell drop emails. you can turn them back on anytime in your account settings. the radio keeps playing either way.',
    true,
  );
}
