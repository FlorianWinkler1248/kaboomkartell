'use client';

/**
 * MissionAcceptButton — Accept/Withdraw-Insel der Mission-Detail-Seite (ADR-039).
 *
 * Erstes produktives T2-Gate der Plattform. Zustandsmaschine (Spec
 * kbk-mission-board, Ablauf C5):
 *   - ausgeloggt          → Login-CTA (/login)
 *   - eingeloggt T0/T1    → disabled Button + Hinweis „Full verification (2FA)
 *                           required" + Link /settings/security
 *   - T2, nicht angenommen → ACCEPT (POST /api/missions/[slug]/accept)
 *   - T2, ACCEPTED         → ACCEPTED-Badge + WITHDRAW (DELETE selbe Route)
 *   - T2, COMPLETED        → „Mission fulfilled"-Badge OHNE Withdraw-Button
 *                            (der Server lehnt Withdraw auf COMPLETED eh mit
 *                            409 completed_locked ab — kein toter Button)
 *
 * Der Server bleibt die Wahrheit: 409-Antworten werden über das
 * maschinenlesbare `code`-Feld unterschieden (already_accepted /
 * mission_not_open / not_acceptable / completed_locked) — NIE über
 * englischen Fehlertext. 404 (archiviert/weg) zeigt Toast + refresht die
 * Seite. Tier-Check client-seitig NUR über TIER_ORDER aus @/lib/badges
 * (permissions.ts importiert prisma → bricht das Client-Bundle).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { TIER_ORDER } from '@/lib/badges';
import { useToast } from '@/components/providers/ToastProvider';
import { obsidianFrameVars } from '@/lib/obsidian-frame';

const GREEN = '#3FCF4A';
const YELLOW = '#F5D02E';

/** Eigener Annahme-Status — WITHDRAWN wird server-seitig auf null gemappt
 *  (zurückgezogen verhält sich wie „nie angenommen"). */
export type MissionAcceptanceStatus = 'ACCEPTED' | 'COMPLETED' | null;

interface Props {
  slug: string;
  /** OPEN | PAUSED | COMPLETED — Server-Stand beim Rendern der Seite. */
  missionStatus: string;
  /** Eigene Annahme, server-seitig via auth() + prisma ermittelt (Prop statt GET). */
  acceptanceStatus: MissionAcceptanceStatus;
}

const buttonBase: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.12em',
  padding: '12px 24px',
  minHeight: 44,
  border: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)',
};

export default function MissionAcceptButton({ slug, missionStatus, acceptanceStatus }: Props) {
  const { data: session, status: sessionStatus } = useSession();
  const t = useTranslations('mission.accept');
  const { toast } = useToast();
  const router = useRouter();

  const [status, setStatus] = useState<MissionAcceptanceStatus>(acceptanceStatus);
  const [busy, setBusy] = useState(false);
  const accepted = status !== null;

  // Session lädt noch → nichts flackern lassen.
  if (sessionStatus === 'loading') return null;

  // Nicht-OPEN und nicht angenommen → kein Accept-Bereich (PAUSED/COMPLETED
  // würden server-seitig eh 409 liefern). Bereits Angenommene dürfen weiter
  // ihren Status sehen und zurueckziehen.
  if (missionStatus !== 'OPEN' && !accepted) return null;

  const isLoggedIn = Boolean(session?.user);
  const tierRank = TIER_ORDER[(session?.user?.trustTier ?? 'T0') as keyof typeof TIER_ORDER] ?? 0;
  const isT2 = tierRank >= TIER_ORDER.T2;

  const handleAccept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/missions/${slug}/accept`, { method: 'POST' });
      if (res.ok) {
        setStatus('ACCEPTED');
        toast({ type: 'success', message: t('toastAccepted') });
        router.refresh();
      } else if (res.status === 409) {
        // Konflikt-Unterscheidung NUR über das maschinenlesbare code-Feld —
        // kein Fehlertext-Matching (Copy-Änderungen dürfen keine Logik brechen).
        // already_accepted → als „schon angenommen" werten (kein Fehler-Toast);
        // mission_not_open / not_acceptable → Konflikt-Toast + Refresh.
        const data = await res.json().catch(() => null);
        if (data?.code === 'already_accepted') {
          setStatus('ACCEPTED');
          router.refresh();
        } else {
          toast({ type: 'error', message: t('toastConflict') });
          router.refresh();
        }
      } else if (res.status === 404) {
        // Mission wurde zwischenzeitlich archiviert/entfernt — Server-Re-Check
        // ist die Wahrheit (Spec-Fehler-Szenario).
        toast({ type: 'error', message: t('toastGone') });
        router.refresh();
      } else if (res.status === 403) {
        toast({ type: 'error', message: t('tierHint') });
      } else if (res.status === 401) {
        toast({ type: 'error', message: t('loginHint') });
      } else {
        toast({ type: 'error', message: t('toastError') });
      }
    } catch {
      toast({ type: 'error', message: t('toastError') });
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/missions/${slug}/accept`, { method: 'DELETE' });
      if (res.ok) {
        setStatus(null);
        toast({ type: 'info', message: t('toastWithdrawn') });
        router.refresh();
      } else if (res.status === 404) {
        // Keine (eigene) Acceptance mehr — lokalen Zustand angleichen.
        setStatus(null);
        router.refresh();
      } else if (res.status === 409) {
        // completed_locked: Flow hat die Annahme inzwischen als erfüllt
        // anerkannt — Server ist die Wahrheit, lokal auf COMPLETED angleichen.
        const data = await res.json().catch(() => null);
        if (data?.code === 'completed_locked') {
          setStatus('COMPLETED');
        }
        router.refresh();
      } else {
        toast({ type: 'error', message: t('toastError') });
      }
    } catch {
      toast({ type: 'error', message: t('toastError') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="kbk-obsidian framed"
      style={{ ...obsidianFrameVars(GREEN), padding: 20 }}
    >
      {!isLoggedIn ? (
        /* Anonym → Login-CTA */
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'rgba(255,255,255,0.65)',
              margin: 0,
              flex: '1 1 220px',
            }}
          >
            {t('loginHint')}
          </p>
          <Link
            href="/login"
            style={{
              ...buttonBase,
              color: '#0A0B0C',
              background: GREEN,
              textDecoration: 'none',
              boxShadow: `0 0 16px ${GREEN}66`,
            }}
          >
            {t('loginCta')}
          </Link>
        </div>
      ) : !isT2 ? (
        /* T0/T1 → disabled Button + 2FA-Hinweis */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            disabled
            style={{
              ...buttonBase,
              color: 'rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.08)',
              cursor: 'not-allowed',
              alignSelf: 'flex-start',
            }}
          >
            {t('acceptCta')}
          </button>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: YELLOW,
              margin: 0,
            }}
          >
            {t('tierHint')}{' '}
            <Link
              href="/settings/security"
              style={{ color: YELLOW, textDecoration: 'underline' }}
            >
              {t('tierCta')}
            </Link>
          </p>
        </div>
      ) : status === 'COMPLETED' ? (
        /* T2 + erfüllt → Fulfilled-Badge OHNE Withdraw (Server lehnt Withdraw
           auf COMPLETED eh mit 409 completed_locked ab — kein toter Button) */
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              color: GREEN,
              border: `1px solid ${GREEN}`,
              padding: '6px 12px',
              letterSpacing: '0.15em',
            }}
          >
            ✓ {t('fulfilledBadge')}
          </span>
        </div>
      ) : accepted ? (
        /* T2 + angenommen → Badge + Withdraw */
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              color: GREEN,
              border: `1px solid ${GREEN}`,
              padding: '6px 12px',
              letterSpacing: '0.15em',
            }}
          >
            ✓ {t('acceptedBadge')}
          </span>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'rgba(255,255,255,0.65)',
              margin: 0,
              flex: '1 1 200px',
            }}
          >
            {t('acceptedNote')}
          </p>
          <button
            type="button"
            onClick={handleWithdraw}
            disabled={busy}
            style={{
              ...buttonBase,
              color: 'rgba(255,255,255,0.7)',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.25)',
              clipPath: 'none',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {t('withdrawCta')}
          </button>
        </div>
      ) : (
        /* T2 + offen → Accept */
        <button
          type="button"
          onClick={handleAccept}
          disabled={busy}
          style={{
            ...buttonBase,
            color: '#0A0B0C',
            background: GREEN,
            boxShadow: `0 0 16px ${GREEN}66`,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {t('acceptCta')}
        </button>
      )}
    </div>
  );
}
