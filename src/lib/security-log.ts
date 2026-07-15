/**
 * Security-Event-Logger (Block F, v2.5)
 *
 * Append-only Audit-Log für alle Account-Security-relevanten Events.
 * Fehlertolerant: Logging-Fehler brechen NIE den Haupt-Auth-Flow.
 *
 * Patterns:
 *   await logSecurityEvent('login_success', { userId, request });
 *   await logSecurityEvent('login_failed', { request, metadata: { email } });
 *   await logSecurityEvent('account_locked', { userId, request, metadata: { lockoutUntil, attempts } });
 *
 * Sicherheits-Notes:
 * - Wir loggen NIEMALS Passwoerter, Tokens, Secrets — nur Metadata, die für
 *   Audit-Forensik benötigt wird (Email-Hash maximal, IP, UA, Lockout-Daten).
 * - User-Agents können lang werden — wir trimmen auf 512 chars.
 * - userId kann null sein bei login_failed mit unbekannter Email (gewollt).
 */

import prisma from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';

export type SecurityEventType =
  // Login-Flow
  | 'login_success'
  | 'login_failed'
  | 'login_rate_limited'
  // Account-Lockout
  | 'account_locked'
  | 'account_unlocked'
  // 2FA
  | '2fa_setup_started'
  | '2fa_setup_cancelled'
  | '2fa_enabled'
  | '2fa_disabled'
  | '2fa_verify_failed'
  | '2fa_backup_used'
  // 2FA Email-Methode (v2.7)
  | '2fa_email_sent'
  | '2fa_email_used'
  // Password-Reset
  | 'password_reset_requested'
  | 'password_reset_completed'
  // Session
  | 'logout_all'
  // Register
  | 'register_success'
  | 'register_failed'
  | 'register_rate_limited'
  // Email-Verification (v2.7)
  | 'email_verified'
  | 'email_verification_resent'
  // Badge-Verwaltung (v2.27, ADR-005 Phase 1)
  | 'badge_granted'
  | 'badge_revoked'
  // Account-Linking via OAuth (v2.30, ADR-005 Sektion F)
  | 'account_linked'
  | 'account_unlinked';

interface LogOptions {
  userId?: string | null;
  request?: Request;
  metadata?: Record<string, unknown>;
}

const MAX_USER_AGENT_LEN = 512;

export async function logSecurityEvent(
  eventType: SecurityEventType,
  opts: LogOptions = {}
): Promise<void> {
  try {
    const ip = opts.request ? getClientIp(opts.request) : null;
    const ua = opts.request?.headers.get('user-agent')?.slice(0, MAX_USER_AGENT_LEN) ?? null;
    const metadata = opts.metadata ? JSON.stringify(opts.metadata) : null;

    await prisma.securityEvent.create({
      data: {
        userId: opts.userId ?? null,
        eventType,
        ip,
        userAgent: ua,
        metadata,
      },
    });
  } catch (err) {
    // Audit-Logging darf NIE den Haupt-Flow blockieren. Nur console.error.
    console.error('[security-log] failed to write event:', eventType, err);
  }
}
