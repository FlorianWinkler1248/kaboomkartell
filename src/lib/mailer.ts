/**
 * SMTP-Mailer (Block D, v2.4)
 *
 * Lazy-initialisierter nodemailer-Transport. Liest SMTP-Config aus env:
 *   SMTP_HOST       (z.B. mail.kaboomkartell.com)
 *   SMTP_PORT       (587 STARTTLS oder 465 TLS — default 587)
 *   SMTP_USER       (SMTP-Username)
 *   SMTP_PASS       (SMTP-Password)
 *   SMTP_FROM       (Absender-Address, z.B. "KaboomKartell <noreply@kaboomkartell.com>")
 *   SMTP_SECURE     (optional, "true" für 465; default false für STARTTLS auf 587)
 *
 * Wenn env nicht vollständig: Mailer-Aufrufe werfen — UI muss damit umgehen
 * (z.B. "Email service temporarily unavailable").
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true';

  if (!host || !user || !pass) {
    throw new Error('SMTP env vars missing — set SMTP_HOST, SMTP_USER, SMTP_PASS');
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return cachedTransporter;
}

export interface MailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(params: MailParams): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM ?? 'noreply@kaboomkartell.com';
  await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

/**
 * Generischer KBK-Email-Wrapper im Cockpit-Style.
 * Liefert HTML-Body um den Inhalt — alle Templates teilen sich diesen Look.
 */
function wrapEmailHtml(innerHtml: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0; padding:32px 16px; background:#0A0B0C; font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="max-width:480px; margin:0 auto; background:#121315; border:1px solid rgba(63,207,74,0.3); padding:32px;" cellspacing="0" cellpadding="0">
    <tr><td>
      <h1 style="color:#3FCF4A; font-size:18px; letter-spacing:0.15em; text-transform:uppercase; margin:0 0 16px;">KABOOMKARTELL</h1>
      ${innerHtml}
    </td></tr>
  </table>
  <p style="text-align:center; color:rgba(255,255,255,0.3); font-size:11px; margin-top:24px;">
    KaboomKartell · Make Noise Together
  </p>
</body>
</html>`;
}

/**
 * Email-Verification-Template (v2.7).
 * Beim Register: isResend=false (Default) — Welcome-Tonalitaet.
 * Beim Resend-Klick:  isResend=true        — "frischer Link" statt Welcome.
 */
export function buildVerifyEmail(
  verifyUrl: string,
  isResend = false,
): { subject: string; text: string; html: string } {
  const subject = isResend
    ? 'KaboomKartell — Your new verification link'
    : 'KaboomKartell — Verify your email';

  const intro = isResend
    ? `Here's a fresh verification link for your KaboomKartell account (valid for 24 hours):`
    : `Welcome to KaboomKartell.\n\nClick this link to verify your email address (valid for 24 hours):`;
  const text = `${intro}
${verifyUrl}

Until you verify, your account is in T0 status — read-only. After verification you can vote, comment and earn your way up the Wolfpack.

If you didn't ${isResend ? 'request this' : 'sign up'}, ignore this email — no further action is required.

— KaboomKartell`;

  const headline = isResend
    ? `Here's a fresh verification link — the old one may have expired or gotten lost:`
    : `Welcome to the wolfpack. One last step:`;
  const buttonLabel = isResend ? 'VERIFY EMAIL' : 'VERIFY EMAIL';
  const footnote = isResend
    ? `This link expires in 24 hours. If you didn't request a new link, ignore this email.`
    : `This link expires in 24 hours. Without verification your account stays in T0 status (read-only).`;

  const inner = `
    <p style="color:#fff; font-size:16px; line-height:1.5; margin:0 0 16px;">
      ${headline}
    </p>
    <p style="margin:24px 0;">
      <a href="${verifyUrl}" style="display:inline-block; background:#3FCF4A; color:#0A0B0C; padding:14px 24px; font-weight:900; text-decoration:none; letter-spacing:0.1em;">
        ${buttonLabel}
      </a>
    </p>
    <p style="color:rgba(255,255,255,0.6); font-size:12px; line-height:1.5; margin:0 0 16px;">
      Or copy and paste this link in your browser:<br>
      <span style="color:#3FCF4A; word-break:break-all;">${verifyUrl}</span>
    </p>
    <p style="color:rgba(255,255,255,0.5); font-size:11px; line-height:1.5; margin:24px 0 0;">
      ${footnote}
    </p>`;
  return { subject, text, html: wrapEmailHtml(inner) };
}

/**
 * Email-OTP-Template (v2.7).
 * purpose='login': User loggt sich mit 2FA-Email ein.
 * purpose='setup': User aktiviert gerade 2FA-Email zum ersten Mal (eingeloggt).
 */
export function buildOtpEmail(
  otp: string,
  purpose: 'login' | 'setup' = 'login',
): { subject: string; text: string; html: string } {
  const isSetup = purpose === 'setup';
  const subject = isSetup
    ? 'KaboomKartell — Confirm your 2FA setup'
    : 'KaboomKartell — Your sign-in code';

  const headlineText = isSetup
    ? `You're enabling email-based 2FA on your KaboomKartell account. Enter this code on the setup page to finish:`
    : `Your KaboomKartell sign-in code:`;
  const wrongPersonText = isSetup
    ? `If you didn't initiate this 2FA setup, ignore this email and review your account security.`
    : `If you didn't try to sign in, change your password immediately and ignore this email.`;
  const text = `${headlineText}

  ${otp}

This code expires in 10 minutes. ${wrongPersonText}

— KaboomKartell`;

  const headlineHtml = isSetup ? `Confirm your 2FA setup:` : `Your sign-in code:`;
  const ctaLine = isSetup
    ? `Enter this code on the 2FA-setup page to enable email-based 2FA on your account.`
    : `Enter this code on the sign-in page to complete authentication.`;
  const footnote = isSetup
    ? `Valid for 10 minutes. If you didn't initiate this 2FA setup, ignore this email and review your account security.`
    : `Valid for 10 minutes. If you didn't try to sign in — change your password immediately.`;

  const inner = `
    <p style="color:#fff; font-size:16px; line-height:1.5; margin:0 0 16px;">
      ${headlineHtml}
    </p>
    <p style="margin:24px 0; text-align:center;">
      <span style="display:inline-block; background:rgba(63,207,74,0.1); border:1px solid #3FCF4A; color:#3FCF4A; padding:18px 28px; font-family:'Courier New',monospace; font-size:32px; letter-spacing:0.5em; font-weight:900;">
        ${otp}
      </span>
    </p>
    <p style="color:rgba(255,255,255,0.6); font-size:12px; line-height:1.5; margin:0 0 16px;">
      ${ctaLine}
    </p>
    <p style="color:rgba(255,255,255,0.5); font-size:11px; line-height:1.5; margin:24px 0 0;">
      ${footnote}
    </p>`;
  return { subject, text, html: wrapEmailHtml(inner) };
}

/**
 * KBK-themed Password-Reset-Email-Template.
 * Uses inline styles (Email-Clients ignorieren oft externe CSS).
 */
export function buildResetEmail(resetUrl: string): { subject: string; text: string; html: string } {
  const subject = 'KaboomKartell — Reset your password';
  const text = `You requested a password reset for your KaboomKartell account.

Click this link to set a new password (valid for 1 hour):
${resetUrl}

If you didn't request this, ignore this email — your password stays the same.

— KaboomKartell`;

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0; padding:32px 16px; background:#0A0B0C; font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="max-width:480px; margin:0 auto; background:#121315; border:1px solid rgba(63,207,74,0.3); padding:32px;" cellspacing="0" cellpadding="0">
    <tr><td>
      <h1 style="color:#3FCF4A; font-size:18px; letter-spacing:0.15em; text-transform:uppercase; margin:0 0 16px;">KABOOMKARTELL</h1>
      <p style="color:#fff; font-size:16px; line-height:1.5; margin:0 0 16px;">
        You requested a password reset for your account.
      </p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}" style="display:inline-block; background:#3FCF4A; color:#0A0B0C; padding:14px 24px; font-weight:900; text-decoration:none; letter-spacing:0.1em;">
          RESET PASSWORD
        </a>
      </p>
      <p style="color:rgba(255,255,255,0.6); font-size:12px; line-height:1.5; margin:0 0 16px;">
        Or copy and paste this link in your browser:<br>
        <span style="color:#3FCF4A; word-break:break-all;">${resetUrl}</span>
      </p>
      <p style="color:rgba(255,255,255,0.5); font-size:11px; line-height:1.5; margin:24px 0 0;">
        This link expires in 1 hour. If you didn't request this, ignore this email — your password stays the same.
      </p>
    </td></tr>
  </table>
  <p style="text-align:center; color:rgba(255,255,255,0.3); font-size:11px; margin-top:24px;">
    KaboomKartell · Make Noise Together
  </p>
</body>
</html>`;
  return { subject, text, html };
}

/**
 * Daily-Drop-Digest (P1.2 / ADR-035) — EINE Mail über die neuen Tracks seit dem
 * letzten Lauf. Jeder Track-Link + der Tune-In-Link tragen `?ref=drop` (Messung, P0.8),
 * und der Footer MUSS den signierten Unsubscribe-Link tragen (DSGVO, P1.1).
 */
export function buildDailyDropEmail(
  tracks: Array<{ title: string; artist: string; slug: string }>,
  unsubscribeLink: string,
  siteBase: string,
): { subject: string; text: string; html: string } {
  const base = siteBase.replace(/\/$/, '');
  const n = tracks.length;
  const subject =
    n === 1
      ? `KaboomKartell — new drop: ${tracks[0].title}`
      : `KaboomKartell — ${n} fresh drops`;

  const listText = tracks
    .map((t) => `• "${t.title}" — ${t.artist}\n  ${base}/tracks/${t.slug}?ref=drop`)
    .join('\n');
  const text = `fresh on the KaboomKartell airwaves:

${listText}

tune in: ${base}/?ref=drop

—
you get these because you opted in. unsubscribe anytime:
${unsubscribeLink}

— KaboomKartell`;

  const rows = tracks
    .map(
      (t) => `
      <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
        <a href="${base}/tracks/${t.slug}?ref=drop" style="color:#fff;font-size:15px;font-weight:700;text-decoration:none;">${t.title}</a>
        <div style="color:rgba(255,255,255,0.55);font-size:12px;margin-top:2px;">${t.artist}</div>
      </td></tr>`,
    )
    .join('');

  const inner = `
    <p style="color:#fff;font-size:16px;line-height:1.5;margin:0 0 16px;">
      ${n === 1 ? 'fresh on the airwaves:' : `${n} fresh drops on the airwaves:`}
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">${rows}</table>
    <p style="margin:24px 0;">
      <a href="${base}/?ref=drop" style="display:inline-block;background:#3FCF4A;color:#0A0B0C;padding:14px 24px;font-weight:900;text-decoration:none;letter-spacing:0.1em;">
        TUNE IN
      </a>
    </p>
    <p style="color:rgba(255,255,255,0.4);font-size:11px;line-height:1.6;margin:24px 0 0;">
      you get these because you opted in.
      <a href="${unsubscribeLink}" style="color:rgba(255,255,255,0.55);">unsubscribe</a>.
    </p>`;
  return { subject, text, html: wrapEmailHtml(inner) };
}
