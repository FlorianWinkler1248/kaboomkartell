'use client';

/**
 * CrowdControlSection — Startseiten-Widget für das voting-gesteuerte Radio (ADR-026, ADR-033).
 *
 * ADR-033 (18.06.2026): Gevotet wird das ÜBERNÄCHSTE Lied (N+2). Das nächste Lied (N+1)
 * steht beim Track-Start schon fest und wird prominent als fixer „UP NEXT"-Block gezeigt
 * (kein Vote-Button). Darunter die (bis zu) 5 Kandidaten fürs übernächste mit Live-Vote-
 * Tally + Countdown — Überschrift „VOTE: THE ONE AFTER". Eingeloggte Mitglieder ab Trust-
 * Tier T1 stimmen ab; ohne Stimmen wählt der Server zufällig (seeded) aus den 5.
 *
 * Datenquelle: GET /api/radio/crowd-control?channel=… (eigener schneller Poll,
 * entkoppelt von der 30s/15s-now-playing-Sync). Vote: POST /api/radio/vote.
 * Workflow + Mechanik: prozesse/kbk-crowd-control.md.
 *
 * PlayerProvider wird NUR gelesen (selectedChannel/radioMode) — nicht umgebaut.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { useChannelAccent } from '@/hooks/useChannelAccent';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { RADIO_CONFIG } from '@/lib/constants';
import { showVanity } from '@/lib/vanity';
import { TIER_ORDER, type TrustTier } from '@/lib/badges';
import { recordMyVote } from '@/lib/agency-picks';
import type { CrowdControlState } from '@/lib/radio-types';

export default function CrowdControlSection() {
  const t = useTranslations('home.crowd');
  const { selectedChannel, radioMode, getServerNow } = usePlayer();
  const { data: session } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const accent = useChannelAccent();

  const [state, setState] = useState<CrowdControlState | null>(null);
  const [nowTs, setNowTs] = useState<number>(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const channelRef = useRef(selectedChannel);
  channelRef.current = selectedChannel;

  const isAuthed = !!session?.user?.id;
  const tier = (session?.user as { trustTier?: string } | undefined)?.trustTier as TrustTier | undefined;
  const canVote = isAuthed && (TIER_ORDER[tier ?? 'T0'] ?? 0) >= TIER_ORDER.T1;

  // --- Poll des Crowd-Control-Zustands ---
  const fetchState = useCallback(async () => {
    const ch = channelRef.current;
    if (!ch) return;
    try {
      const res = await fetch(`/api/radio/crowd-control?channel=${encodeURIComponent(ch)}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (json?.success) setState(json.data as CrowdControlState);
    } catch (err) {
      console.error('[CrowdControl] fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, RADIO_CONFIG.crowdControlPollMs);
    return () => clearInterval(id);
  }, [fetchState, selectedChannel]);

  // --- 1s-Ticker für den Countdown ---
  useEffect(() => {
    const id = setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // --- Vote abgeben (optimistisch) ---
  const vote = useCallback(
    async (candidateTrackId: string) => {
      if (!state || state.locked) return;
      // Fenster noch nicht offen (öffnet 20s nach Track-Start)? Buttons sind dann
      // bereits disabled — defensiver Guard gegen den clock-korrigierten Server-Stand.
      const wStart = state.windowStartsAt ? new Date(state.windowStartsAt).getTime() : 0;
      if (wStart && getServerNow() < wStart) return;
      if (!isAuthed) {
        // Anon: der Vote-Moment ist der Conversion-Moment (ADR-035 P0.4). Feedback +
        // Weg zum Login mit Rücksprung auf die aktuelle Seite (analog Track-Vote).
        toast({ type: 'info', message: t('toastLogin') });
        const cb = encodeURIComponent(window.location.pathname + window.location.search);
        setTimeout(() => router.push(`/login?callbackUrl=${cb}`), 1200);
        return;
      }
      if (!canVote) {
        toast({ type: 'info', message: t('toastVerify') });
        return;
      }
      if (state.myVote === candidateTrackId) return; // schon gewählt

      const prev = state;
      setBusyId(candidateTrackId);
      // Optimistisch: alte Stimme abziehen, neue addieren.
      setState((s) => {
        if (!s) return s;
        const candidates = s.candidates.map((c) => {
          let votes = c.votes;
          if (c.trackId === s.myVote) votes = Math.max(0, votes - 1);
          if (c.trackId === candidateTrackId) votes = votes + 1;
          return { ...c, votes };
        });
        return { ...s, candidates, myVote: candidateTrackId };
      });

      try {
        const res = await fetch('/api/radio/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: prev.channel,
            decisionSeq: prev.decisionSeq,
            candidateTrackId,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          setState(prev); // Rollback
          if (res.status === 409) {
            toast({ type: 'info', message: t('toastWindowChanged') });
            fetchState();
          } else {
            toast({ type: 'error', message: json?.error ?? t('toastVoteFailed') });
          }
        } else {
          // Agency-Loop (18.06.2026): erfolgreichen Vote im localStorage merken — der Vote
          // gilt dem ÜBERNÄCHSTEN Lied (N+2) für genau dieses Fenster (prev.decisionSeq).
          // Läuft der Track später als decisionSeq+2, erkennt der MiniPlayer „mein Pick läuft".
          recordMyVote(prev.channel, prev.decisionSeq, candidateTrackId);
        }
      } catch {
        setState(prev);
        toast({ type: 'error', message: t('toastVoteFailed') });
      } finally {
        setBusyId(null);
      }
    },
    [state, isAuthed, canVote, toast, fetchState, t, getServerNow, router],
  );

  // Nichts anzeigen, wenn der Channel off-air ist / Crowd Control aus / < 2 Kandidaten.
  if (!radioMode || !state || !state.active) return null;

  const totalVotes = state.candidates.reduce((s, c) => s + c.votes, 0);
  // Vanity-Gate: in der ruhigen Phase keine „0"-Tallies + kein „(0 cast)" zeigen.
  // Voting bleibt voll funktional — nur die leeren Zahlen werden ausgeblendet,
  // bis echter Traffic da ist. Erscheint automatisch ab VANITY_MIN.votesCast.
  const showVotes = showVanity(totalVotes, 'votesCast');
  const maxVotes = Math.max(1, ...state.candidates.map((c) => c.votes));
  // Radio Sync v2: Countdown gegen die clock-korrigierte SERVER-Zeit rechnen, nicht
  // gegen die Browser-Uhr — ein Uhren-Offset darf den Timer nicht verschieben.
  // nowTs (1s-Ticker) treibt nur den Re-Render; der Wert selbst wird nicht gebraucht.
  void nowTs;
  const serverNow = getServerNow();
  const windowStart = state.windowStartsAt ? new Date(state.windowStartsAt).getTime() : 0;
  const windowEnd = state.windowEndsAt ? new Date(state.windowEndsAt).getTime() : 0;
  const preOpen = !state.locked && windowStart > 0 && serverNow < windowStart;
  const votingOpen = !state.locked && !preOpen && (windowEnd === 0 || serverNow < windowEnd);
  // Fenster-Zeit vorbei, aber Server-Lock noch nicht durchgepollt (bis ~9s Lag):
  // sofort „locking…" zeigen statt eingefrorenem „closes in 0s".
  const windowClosed = !state.locked && !preOpen && windowEnd > 0 && serverNow >= windowEnd;
  const opensInSec = preOpen ? Math.max(0, Math.round((windowStart - serverNow) / 1000)) : 0;
  const remainingSec = windowEnd ? Math.max(0, Math.round((windowEnd - serverNow) / 1000)) : 0;
  const lockedTrack = state.lockedTrackId
    ? state.candidates.find((c) => c.trackId === state.lockedTrackId)
    : null;

  const accentColor = accent.color;

  return (
    <section style={{ padding: '32px 24px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div
            className="kbk-obsidian framed"
            style={{
              ...obsidianFrameVars(accentColor),
              padding: 24,
              borderRadius: 14,
            }}
          >
        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.22em',
              color: accentColor,
              textTransform: 'uppercase',
            }}
          >
            ↳ Crowd Control · {state.channel}
          </div>
          <h2
            className="font-heading"
            style={{
              fontSize: 'clamp(22px, 3vw, 32px)',
              fontWeight: 900,
              letterSpacing: '0.02em',
              margin: 0,
              color: '#fff',
              textShadow: `0 0 22px ${accentColor}55`,
            }}
          >
            {t('voteTheOneAfter')}
          </h2>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
            {state.locked ? (
              <span style={{ color: accentColor }}>
                🔒 {lockedTrack ? t('lockedNext', { title: lockedTrack.title }) : t('lockedSet')}
              </span>
            ) : windowClosed ? (
              <span style={{ color: accentColor }}>🔒 {t('votingClosing')}</span>
            ) : preOpen ? (
              <span>
                {t.rich('votingOpensIn', {
                  seconds: opensInSec,
                  strong: (chunks) => <strong style={{ color: accentColor }}>{chunks}</strong>,
                })}
              </span>
            ) : (
              <span>
                {t.rich('votingClosesIn', {
                  seconds: remainingSec,
                  strong: (chunks) => <strong style={{ color: accentColor }}>{chunks}</strong>,
                })}
              </span>
            )}
          </div>
        </div>

        {/* Slot-Übergang: Sendeplan zeigt schon das neue Genre, dieser Track/dieses Voting-
            Fenster läuft aber noch aus dem vorigen Pool — kurzer Hinweis statt stillem Wechsel. */}
        {state.transitioning && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.65)',
              marginBottom: 12,
            }}
          >
            ↻ {t('genreSwitchSoon')}
          </div>
        )}

        {/* UP NEXT (N+1) — fix, kein Vote. ADR-033: steht beim Track-Start schon fest. */}
        {state.upNextTrackId && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              marginBottom: 14,
              borderRadius: 10,
              background: `${accentColor}14`,
              border: `1px solid ${accentColor}55`,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.22em',
                color: accentColor,
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              {t('upNext')}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 15,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {state.upNextTitle}
              </div>
              {state.upNextArtist && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.6)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {state.upNextArtist}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Kandidaten fürs ÜBERNÄCHSTE Lied (N+2) — hierüber wird gevotet. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {state.candidates.map((c) => {
            const isMine = state.myVote === c.trackId;
            const isLocked = state.locked && state.lockedTrackId === c.trackId;
            const barPct = Math.round((c.votes / maxVotes) * 100);
            return (
              <button
                key={c.trackId}
                onClick={() => vote(c.trackId)}
                disabled={state.locked || !votingOpen || busyId !== null}
                aria-pressed={isMine}
                style={{
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 14,
                  alignItems: 'center',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  borderRadius: 10,
                  overflow: 'hidden',
                  cursor: (state.locked || !votingOpen) ? 'default' : 'pointer',
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isMine || isLocked ? accentColor : 'rgba(255,255,255,0.10)'}`,
                  color: '#fff',
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Tally-Balken im Hintergrund */}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${barPct}%`,
                    background: `${accentColor}22`,
                    borderRight: barPct > 0 ? `2px solid ${accentColor}66` : 'none',
                    transition: 'width 0.4s ease',
                    pointerEvents: 'none',
                  }}
                />
                {/* Cover */}
                <div
                  style={{
                    position: 'relative',
                    width: 44,
                    height: 44,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,0.08)',
                    flexShrink: 0,
                  }}
                >
                  {c.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.coverUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : null}
                </div>
                {/* Titel + Artist */}
                <div style={{ position: 'relative', minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.6)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.artist}
                  </div>
                </div>
                {/* Stimmen + eigener Vote */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {isMine && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: '0.04em' }}>
                      {t('yourPick')}
                    </span>
                  )}
                  {showVotes && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, minWidth: 24, textAlign: 'right' }}>
                      {c.votes}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer / CTA */}
        <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)' }}>
          {state.locked ? (
            <span>{t('footerLocked')}</span>
          ) : !showVotes ? (
            // Ruhige Phase: count-freie Einladung statt „(0 cast)".
            <span>{t('footerQuiet')}</span>
          ) : !isAuthed ? (
            <span>
              {t.rich('footerLogin', {
                count: totalVotes,
                loginLink: (chunks) => (
                  <a href="/login" style={{ color: accentColor, textDecoration: 'underline' }}>
                    {chunks}
                  </a>
                ),
              })}
            </span>
          ) : !canVote ? (
            <span>{t('footerVerify', { count: totalVotes })}</span>
          ) : (
            <span>{t('footerOpen', { count: totalVotes })}</span>
          )}
        </div>
        </div>
      </div>
    </section>
  );
}
