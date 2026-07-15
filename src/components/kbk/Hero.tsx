'use client';

/**
 * KBK Hero — Headline, Tagline, CTAs + animiertes LogoMark rechts.
 * Portiert aus neues Design KBK/app.jsx (Zeilen 165–240).
 *
 * TUNE-IN-Button ruft usePlayer().enterRadioMode() auf.
 * Layout: Grid 1fr 360px (desktop) — auf mobile stacken wir (1fr).
 */

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { useToast } from '@/components/providers/ToastProvider';
import LogoMark from './LogoMark';
import { IcoDiscord } from './icons';
import { DISCORD_INVITE_URL } from '@/lib/constants';

type Stats = {
  wolvesOnline: number | null; // null = unter Vanity-Schwellwert → ausgeblendet
  tracksSpun: number;
  avgBpm: number;
  uptimeLabel: string;
};

export default function Hero() {
  const player = usePlayer();
  const t = useTranslations('hero');
  const tk = useTranslations('kbkUi');

  // Responsive-Switch per matchMedia — wir rendern desktop-layout per default
  // und switchen auf single-column wenn Breakpoint unter md.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Echte Stats aus /api/kbk/stats — initial null, dann nachladen.
  // Wir rendern em-dashes bis die Daten da sind (statt faker Placeholder).
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return; // P0.6: verdeckter Tab pollt nicht
      fetch('/api/kbk/stats')
        .then((r) => r.json())
        .then((data: Stats) => {
          if (alive) setStats(data);
        })
        .catch(() => {});
    };
    load();
    // Alle 60s refreshen — nicht sekundengenau, aber lebendig.
    const id = setInterval(load, 60_000);
    // P0.6: Tab wieder sichtbar → sofort einmal nachladen.
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <div
      className="kbk-hero"
      style={{
        position: 'relative',
        padding: '60px 24px 40px',
        overflow: 'hidden',
      }}
    >
      {/* Background-Watermark-Logo — auf Mobile via .kbk-hero-watermark hidden */}
      <div
        aria-hidden="true"
        className="kbk-hero-watermark"
        style={{
          position: 'absolute',
          right: -120,
          top: -60,
          opacity: 0.08,
          pointerEvents: 'none',
          transform: 'rotate(-8deg)',
        }}
      >
        <Image
          src="/images/logo-4flow.png"
          alt=""
          width={600}
          height={600}
          style={{ width: 600, height: 600 }}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 360px',
          gap: 40,
          alignItems: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Left — Text + CTAs + Stats */}
        <div>
          {/* Broadcasting-Badge — dynamisch:
              - irgendein Channel live  -> "BROADCASTING LIVE" (grün + Pulse)
              - kein Channel live       -> "STANDBY" (gelb, kein Pulse) */}
          {(() => {
            const isLive = player.activeChannels.length > 0;
            const color = isLive ? '#3FCF4A' : '#F5D02E';
            return (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  border: `1px solid ${color}`,
                  background: isLive ? 'rgba(63,207,74,0.15)' : 'rgba(245,208,46,0.10)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color,
                  letterSpacing: '0.2em',
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: color,
                    animation: isLive ? 'kk-pulse 1s infinite' : undefined,
                  }}
                />
                {isLive ? t('broadcastingLive') : t('standby')}
              </div>
            );
          })()}

          {/* Headline — aria-label fasst die drei Zeilen lesbar zusammen,
              die <br>-Trennung war für Screenreader sonst "MAKENOISE TOGETHER". */}
          <h1
            aria-label={tk('heroHeadlineAria')}
            className="kbk-hero-headline"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(40px, 7vw, 96px)',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              lineHeight: 0.92,
              color: '#fff',
              margin: 0,
              textTransform: 'uppercase',
            }}
          >
            <span>MAKE </span>
            <br />
            <span
              style={{
                color: '#E63B2E',
                textShadow: '0 0 30px #E63B2E',
                fontStyle: 'italic',
                display: 'inline-block',
                transform: 'skewX(-6deg)',
              }}
            >
              NOISE
            </span>
            {/* Explizites Leerzeichen, damit der DOM-Text "NOISE TOGETHER." liest
                und SEO-Crawler keinen "NOISETOGETHER" zusammenkleben. Visuell durch
                den Linebreak danach getrennt. */}
            <span> </span>
            <br />
            <span
              style={{
                color: '#3FCF4A',
                textShadow: '0 0 30px #3FCF4A',
              }}
            >
              TOGETHER.
            </span>
          </h1>

          {/* Hero-Tagline-Block entfernt (Flow's Vorgabe 30.04.2026). Eine
              einzige Mini-Zeile bleibt als Anchor für Erstbesucher — sagt
              wo sie sind und was die Geste ist. */}
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.4,
              marginTop: 16,
              letterSpacing: '0.04em',
            }}
          >
            {t('tagline')}
          </p>

          {/* CTA-Buttons — TUNE-IN-Button ist jetzt das Logo selbst (rechts). */}
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 28,
              flexWrap: 'wrap',
            }}
          >
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="kbk-obsidian polished framed"
              style={{
                color: '#fff',
                padding: '14px 20px',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                textDecoration: 'none',
              }}
            >
              <IcoDiscord size={16} /> {t('joinDiscord')}
            </a>
            {stats && stats.wolvesOnline != null && (
              <span
                aria-hidden="true"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.5)',
                  letterSpacing: '0.15em',
                  alignSelf: 'center',
                }}
              >
                {t('wolvesOnline', { count: stats.wolvesOnline })}
              </span>
            )}
          </div>

        </div>

        {/* Right — animiertes LogoMark als Player-Button.
            Klick startet Radio + Volume hoch (wenn muted). Zusaetzlicher Burst-Pulse
            beim Klick (intensity-Boost + scale-Bounce per CSS-Klasse).
            Auf Mobile (single-column) zeigen wir ein leicht kleineres Logo unter dem Text. */}
        <HeroLogoButton isMobile={isMobile} />
      </div>
    </div>
  );
}

/** Hero-Logo als großer Tune-In-Button.
 *  Hidden default state vom LogoMark zeigt Beat-Pulse + Ripples,
 *  Click triggert kurzen Intensity-Boost + scale-Bounce. */
function HeroLogoButton({ isMobile }: { isMobile: boolean }) {
  const player = usePlayer();
  const { toast } = useToast();
  const t = useTranslations('hero');
  const [burst, setBurst] = useState(false);
  // Hint „TAP TO TUNE IN" — sichtbar bis User entweder klickt oder anderswo
  // (z.B. via MiniPlayer-Channel-Tab) das Radio aktiviert + Volume hochzieht.
  const [hintVisible, setHintVisible] = useState(true);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-Verstecken: sobald irgendwoher Volume hochgezogen wird UND ein Track
  // aktiv ist, war der User offenbar erfolgreich am Player.
  useEffect(() => {
    if (player.audio.volume > 0 && player.audio.currentTrack) {
      setHintVisible(false);
    }
  }, [player.audio.volume, player.audio.currentTrack]);

  const handleClick = () => {
    // Volume hoch wenn muted (auto-Boot startet muted, damit Browser autoplay erlaubt)
    if (player.audio.volume === 0) {
      player.audio.setVolume(0.7);
    }
    // Radio-Modus sicherstellen — falls User vorher einen Track manuell gestartet hatte
    if (!player.radioMode) {
      player.enterRadioMode().catch((err) => {
        console.error('Logo-Click: enterRadioMode failed:', err);
        toast({ type: 'error', message: t('radioError') });
      });
    }
    setHintVisible(false);
    // Burst-Pulse triggern (700ms)
    setBurst(true);
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => setBurst(false), 700);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <button
        type="button"
        onClick={handleClick}
        aria-label={
          player.audio.volume === 0
            ? t('tuneInAria')
            : player.radioMode
            ? t('pulseAria')
            : t('tuneInAria')
        }
        className={burst ? 'kbk-logo-burst' : undefined}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'inline-block',
          // Burst-Boost über zusätzliche Skala. CSS-Klasse übernimmt die Animation,
          // hier nur Defensiv-Default falls die Klasse nicht greift.
          transform: burst ? 'scale(1.08)' : 'scale(1)',
          transition: 'transform 0.18s ease-out',
        }}
      >
        <LogoMark size={isMobile ? 240 : 340} intensity={burst ? 1.7 : 1} />
      </button>
      {hintVisible && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: -22,
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.3em',
            color: '#F5D02E',
            background: 'rgba(10,11,12,0.7)',
            padding: '4px 10px',
            border: '1px solid rgba(245,208,46,0.4)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            animation: 'kk-pulse 1.6s ease-in-out infinite',
          }}
        >
          {t('tapToTuneIn')}
        </span>
      )}
    </div>
  );
}
