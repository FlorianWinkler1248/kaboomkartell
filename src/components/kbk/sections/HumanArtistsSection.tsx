'use client';

/**
 * HumanArtistsSection — „HUMAN ARTISTS WANTED" (Homepage, ADR-039).
 *
 * Prominenter Obsidian-Block zwischen Wolfpack- und RecentReleases-Sektion:
 * KBK ist kein AI-Showcase — menschliche Künstler sollen ihren Sound auf die
 * Decks bringen. Zwei CTAs (featured Help-Artikel + Mission-Board) plus der
 * Bewerbungs-Einstieg als Client-Insel (ArtistApplyBlock).
 *
 * Bewerbungs-Regeln (Spec kbk-artist-onboarding):
 *   - T2-Pflicht (2FA) — unter T2 gibt es eine FREUNDLICHE Erklärung + 2FA-Weg
 *     statt Formular (Gate ja, Abschreckung nein).
 *   - HART 1 Bewerbung pro Account (DB-unique) — deshalb deutliche Warnhinweise
 *     VOR dem Senden („one shot, make it count") + Bestätigungs-Zwischenschritt
 *     mit Pflicht-Checkbox.
 *   - Die Ziel-Mail-Adresse bleibt server-seitig — der Client kennt NUR den
 *     API-Endpoint /api/artist-application (Harvester-Schutz).
 *   - already-applied-Zustand via GET /api/artist-application (defensiv
 *     geparst, Contract-tolerant).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import { TIER_ORDER } from '@/lib/badges';
import { useToast } from '@/components/providers/ToastProvider';
import { obsidianFrameVars } from '@/lib/obsidian-frame';

const GREEN = '#3FCF4A';
const RED = '#E63B2E';
const YELLOW = '#F5D02E';

const MESSAGE_MIN = 20;
const MESSAGE_MAX = 2000;
const MAX_LINKS = 5;

const ctaBase: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.12em',
  padding: '12px 22px',
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none',
  clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)',
  whiteSpace: 'nowrap',
};

const monoText: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'rgba(255,255,255,0.65)',
  lineHeight: 1.6,
  margin: 0,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#fff',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  padding: '10px 12px',
  outline: 'none',
};

type ApplyPhase = 'checking' | 'form' | 'confirm' | 'sending' | 'applied' | 'success';

/** Bewerbungs-Einstieg — Client-Insel mit Ein-Schuss-Warnung + Confirm-Schritt. */
function ArtistApplyBlock() {
  const { data: session, status: sessionStatus } = useSession();
  const t = useTranslations('humanArtists.apply');
  const { toast } = useToast();

  const isLoggedIn = Boolean(session?.user);
  const tierRank = TIER_ORDER[(session?.user?.trustTier ?? 'T0') as keyof typeof TIER_ORDER] ?? 0;
  const isT2 = tierRank >= TIER_ORDER.T2;

  const [phase, setPhase] = useState<ApplyPhase>('checking');
  const [message, setMessage] = useState('');
  const [links, setLinks] = useState<string[]>(['']);
  const [confirmChecked, setConfirmChecked] = useState(false);

  // already-applied-Zustand nur fuer T2 relevant (darunter gibt es kein Formular).
  useEffect(() => {
    if (!isT2) return;
    let cancelled = false;
    fetch('/api/artist-application')
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const payload = await res.json().catch(() => null);
          // Route-Contract: { success: true, data: { applied: bool, ... } } —
          // defensiv auch flache Varianten akzeptieren.
          const data = payload && typeof payload === 'object' ? (payload.data ?? payload) : null;
          let applied = false;
          if (data && typeof data === 'object') {
            if (typeof data.applied === 'boolean') applied = data.applied;
            else if (typeof data.status === 'string' && data.status.length > 0) applied = true;
          }
          setPhase(applied ? 'applied' : 'form');
        } else {
          // 404 = keine Bewerbung; alles andere: Formular trotzdem anbieten —
          // die harte Garantie ist das DB-unique am POST.
          setPhase('form');
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('form');
      });
    return () => {
      cancelled = true;
    };
  }, [isT2]);

  if (sessionStatus === 'loading') return null;

  // --- Ausgeloggt: Login-CTA -------------------------------------------------
  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <p style={{ ...monoText, flex: '1 1 240px' }}>{t('loginHint')}</p>
        <Link
          href="/login"
          style={{ ...ctaBase, color: '#0A0B0C', background: GREEN, boxShadow: `0 0 16px ${GREEN}66` }}
        >
          {t('loginCta')}
        </Link>
      </div>
    );
  }

  // --- T0/T1: freundliche Erklärung + 2FA-Weg (kein Formular) ----------------
  if (!isT2) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <p style={{ ...monoText, flex: '1 1 240px', color: YELLOW }}>{t('tierHint')}</p>
        <Link
          href="/settings/security"
          style={{ ...ctaBase, color: '#0A0B0C', background: YELLOW, boxShadow: `0 0 16px ${YELLOW}66` }}
        >
          {t('tierCta')}
        </Link>
      </div>
    );
  }

  // --- T2-Zustände ------------------------------------------------------------
  if (phase === 'checking') {
    return <p style={monoText}>{t('checking')}</p>;
  }

  if (phase === 'applied' || phase === 'success') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            color: GREEN,
            border: `1px solid ${GREEN}`,
            padding: '6px 12px',
            letterSpacing: '0.15em',
            alignSelf: 'flex-start',
          }}
        >
          ✓ {phase === 'success' ? t('successTitle') : t('alreadyAppliedTitle')}
        </span>
        <p style={monoText}>{phase === 'success' ? t('successBody') : t('alreadyAppliedBody')}</p>
      </div>
    );
  }

  const cleanLinks = links.map((l) => l.trim()).filter(Boolean);

  const handleReview = () => {
    const msg = message.trim();
    if (msg.length < MESSAGE_MIN || msg.length > MESSAGE_MAX) {
      toast({ type: 'error', message: t('toastValidation') });
      return;
    }
    if (
      cleanLinks.length > MAX_LINKS ||
      cleanLinks.some((l) => !/^https?:\/\/\S+$/i.test(l))
    ) {
      toast({ type: 'error', message: t('toastValidation') });
      return;
    }
    setConfirmChecked(false);
    setPhase('confirm');
  };

  const handleSend = async () => {
    if (!confirmChecked) return;
    setPhase('sending');
    try {
      const res = await fetch('/api/artist-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), links: cleanLinks }),
      });
      if (res.ok) {
        // 201 auch bei Mail-Fehlschlag (Spec) — der User sieht immer Erfolg.
        setPhase('success');
        toast({ type: 'success', message: t('successTitle') });
      } else if (res.status === 409) {
        // already_applied — Ein-Schuss-Regel hat gegriffen, kein Fehler-Drama.
        setPhase('applied');
      } else if (res.status === 403) {
        toast({ type: 'error', message: t('tierHint') });
        setPhase('form');
      } else if (res.status === 400) {
        toast({ type: 'error', message: t('toastValidation') });
        setPhase('form');
      } else if (res.status === 429) {
        toast({ type: 'error', message: t('toastRateLimit') });
        setPhase('form');
      } else {
        toast({ type: 'error', message: t('toastError') });
        setPhase('form');
      }
    } catch {
      toast({ type: 'error', message: t('toastError') });
      setPhase('form');
    }
  };

  if (phase === 'confirm' || phase === 'sending') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h4
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 900,
            color: RED,
            letterSpacing: '0.12em',
            margin: 0,
          }}
        >
          {t('confirmTitle')}
        </h4>
        <p style={{ ...monoText, color: 'rgba(255,255,255,0.8)' }}>{t('confirmBody')}</p>
        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: '#fff',
            lineHeight: 1.5,
          }}
        >
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(e) => setConfirmChecked(e.target.checked)}
            disabled={phase === 'sending'}
            style={{ marginTop: 2, accentColor: RED, width: 16, height: 16, flexShrink: 0 }}
          />
          {t('confirmCheckbox')}
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            onClick={handleSend}
            disabled={!confirmChecked || phase === 'sending'}
            style={{
              ...ctaBase,
              border: 'none',
              color: '#0A0B0C',
              background: confirmChecked ? RED : 'rgba(255,255,255,0.15)',
              cursor: confirmChecked && phase !== 'sending' ? 'pointer' : 'not-allowed',
              boxShadow: confirmChecked ? `0 0 16px ${RED}66` : 'none',
            }}
          >
            {phase === 'sending' ? t('sending') : t('confirmSend')}
          </button>
          <button
            type="button"
            onClick={() => setPhase('form')}
            disabled={phase === 'sending'}
            style={{
              ...ctaBase,
              clipPath: 'none',
              color: 'rgba(255,255,255,0.7)',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.25)',
              cursor: phase === 'sending' ? 'not-allowed' : 'pointer',
            }}
          >
            {t('confirmBack')}
          </button>
        </div>
      </div>
    );
  }

  // --- Formular (phase === 'form') --------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* HARTE Warnung VOR dem Senden — Ein-Schuss-Regel (Spec-Pflicht) */}
      <div
        style={{
          border: `1px solid ${RED}66`,
          background: 'rgba(230,59,46,0.08)',
          padding: '12px 14px',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            fontWeight: 900,
            color: RED,
            letterSpacing: '0.15em',
            marginBottom: 4,
          }}
        >
          ⚠ {t('warningTitle')}
        </div>
        <p style={{ ...monoText, color: 'rgba(255,255,255,0.8)' }}>{t('warningBody')}</p>
      </div>

      <div>
        <label
          htmlFor="artist-apply-message"
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.2em',
            marginBottom: 6,
          }}
        >
          {t('messageLabel')}
        </label>
        <textarea
          id="artist-apply-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('messagePlaceholder')}
          rows={5}
          maxLength={MESSAGE_MAX}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.35)',
            textAlign: 'right',
            marginTop: 2,
          }}
        >
          {message.trim().length}/{MESSAGE_MAX}
        </div>
      </div>

      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.2em',
            marginBottom: 6,
          }}
        >
          {t('linksLabel')}
        </div>
        <p style={{ ...monoText, fontSize: 11, marginBottom: 8 }}>{t('linksHint')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {links.map((link, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <input
                type="url"
                value={link}
                onChange={(e) =>
                  setLinks((prev) => prev.map((l, idx) => (idx === i ? e.target.value : l)))
                }
                placeholder={t('linkPlaceholder')}
                style={{ ...inputStyle, flex: 1 }}
              />
              {links.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.5)',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '0 10px',
                    cursor: 'pointer',
                    letterSpacing: '0.1em',
                  }}
                >
                  {t('removeLink')}
                </button>
              )}
            </div>
          ))}
        </div>
        {links.length < MAX_LINKS && (
          <button
            type="button"
            onClick={() => setLinks((prev) => [...prev, ''])}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: GREEN,
              background: 'transparent',
              border: 'none',
              padding: '8px 0',
              cursor: 'pointer',
              letterSpacing: '0.1em',
            }}
          >
            {t('addLink')}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleReview}
        style={{
          ...ctaBase,
          border: 'none',
          color: '#0A0B0C',
          background: GREEN,
          cursor: 'pointer',
          boxShadow: `0 0 16px ${GREEN}66`,
          alignSelf: 'flex-start',
        }}
      >
        {t('reviewCta')}
      </button>
    </div>
  );
}

export default function HumanArtistsSection() {
  const t = useTranslations('humanArtists');

  return (
    <div className="kbk-page-section" style={{ padding: '20px 24px' }}>
      <SectionTitle sub="06" label={t('kicker')} title={t('title')} accent="red" />

      <div
        className="kbk-obsidian framed"
        style={{ ...obsidianFrameVars(RED), padding: 24, marginTop: 20 }}
      >
        {/* Kern-Botschaft: kein AI-Showcase */}
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '0.02em',
            lineHeight: 1.35,
            margin: '0 0 10px',
            textTransform: 'uppercase',
          }}
        >
          {t('message')}
        </p>
        <p style={{ ...monoText, marginBottom: 14, maxWidth: 680 }}>{t('pitch')}</p>

        {/* Externe Präsenz bleibt beim Künstler (Verlinkung, Audio via KBK) */}
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: GREEN,
            lineHeight: 1.6,
            margin: '0 0 18px',
          }}
        >
          {t('keepNote')}
        </p>

        {/* CTAs: featured Help-Artikel + Mission-Board */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          <Link
            href="/help"
            style={{ ...ctaBase, color: '#0A0B0C', background: GREEN, boxShadow: `0 0 16px ${GREEN}66` }}
          >
            {t('ctaHelp')}
          </Link>
          <Link
            href="/mission"
            style={{
              ...ctaBase,
              clipPath: 'none',
              color: '#fff',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            {t('ctaMissions')}
          </Link>
        </div>

        {/* Bewerbungs-Einstieg (Client-Insel, T2-Gate) */}
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.1)',
            paddingTop: 18,
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              color: RED,
              letterSpacing: '0.2em',
              margin: '0 0 12px',
            }}
          >
            {t('apply.heading')}
          </h3>
          <ArtistApplyBlock />
        </div>
      </div>
    </div>
  );
}
