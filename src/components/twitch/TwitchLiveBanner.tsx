'use client';

/**
 * <TwitchLiveBanner /> (v2.31, ADR-005 Sektion E)
 *
 * Heavy LIVESTREAM-NOW!-Banner über der TopNavBar. Wenn der KBK-Channel
 * live ist, zieht das Ding maximale Aufmerksamkeit: Pulsierender Lila-
 * Hintergrund (RGB-Cycling), drei blinkende LEDs, großer Bungee-Schriftzug,
 * Marquee-Text mit Channel + Title, Klick führt zu /radio.
 *
 * Wenn der Channel offline ist oder kein Channel konfiguriert ist, rendert
 * der Banner nichts — bleibt komplett unsichtbar.
 *
 * Polling 30s. Server-API hat selbst 30s-Cache vor Helix, also 1 Helix-Call
 * pro Server pro Minute pro Browser.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

type LiveResponse = {
  configured: boolean;
  channel: string | null;
  live: boolean;
  title?: string;
  viewerCount?: number;
  gameName?: string | null;
};

const POLL_MS = 30_000;

export function TwitchLiveBanner() {
  const t = useTranslations('widgetsUi');
  const [data, setData] = useState<LiveResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/twitch/live-status');
        if (!res.ok) return;
        const json: LiveResponse = await res.json();
        if (!cancelled) setData(json);
      } catch {
        /* silent — Banner verschwindet einfach bei Netzwerkfehler */
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data?.configured || !data.live || !data.channel) return null;

  // Marquee-Text mehrfach repeaten, damit der Scroll-Loop nahtlos durchläuft.
  const marqueeChunk = (
    <span style={{ display: 'inline-block', paddingRight: 40 }}>
      ⚡ {t('livestreamNow')} ⚡ {data.title ?? `twitch.tv/${data.channel}`}
      {typeof data.viewerCount === 'number' ? ` · 👥 ${t('watching', { count: data.viewerCount })}` : ''}
      {' · '}
    </span>
  );

  return (
    <Link
      href="/radio"
      aria-label={t('watchLiveStreamAria', { channel: data.channel })}
      className="kbk-livestream-pulse kbk-livestream-bg"
      style={{
        display: 'block',
        textDecoration: 'none',
        color: '#fff',
        borderTop: '2px solid rgba(145,70,255,0.85)',
        borderBottom: '2px solid rgba(145,70,255,0.85)',
        padding: '12px 16px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          maxWidth: 1280,
          margin: '0 auto',
        }}
      >
        {/* Linke LED-Trio */}
        <div style={{ display: 'inline-flex', gap: 5, flexShrink: 0 }} aria-hidden>
          <span
            className="kbk-livestream-blink"
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 999,
              background: '#9146FF',
              color: '#9146FF',
              animationDelay: '0s',
            }}
          />
          <span
            className="kbk-livestream-blink"
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 999,
              background: '#FF3B6B',
              color: '#FF3B6B',
              animationDelay: '0.2s',
            }}
          />
          <span
            className="kbk-livestream-blink"
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 999,
              background: '#9146FF',
              color: '#9146FF',
              animationDelay: '0.4s',
            }}
          />
        </div>

        {/* Hauptschriftzug */}
        <div
          className="kbk-livestream-shake"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(15px, 2.4vw, 22px)',
            fontWeight: 900,
            letterSpacing: '0.08em',
            color: '#fff',
            textShadow: '0 0 12px rgba(145,70,255,0.95), 0 0 24px rgba(255,255,255,0.4)',
            flexShrink: 0,
            textTransform: 'uppercase',
          }}
        >
          🔴 {t('livestreamNow')}
        </div>

        {/* Marquee-Bereich */}
        <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
          <div className="kbk-livestream-marquee-track">
            {marqueeChunk}
            {marqueeChunk}
            {marqueeChunk}
            {marqueeChunk}
          </div>
        </div>

        {/* Rechte CTA */}
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 12,
            letterSpacing: '0.18em',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.85)',
            padding: '6px 14px',
            clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
            flexShrink: 0,
            textTransform: 'uppercase',
          }}
        >
          {t('watch')}
        </span>

        {/* Rechte LED-Trio (gespiegelte Verzögerung) */}
        <div style={{ display: 'inline-flex', gap: 5, flexShrink: 0 }} aria-hidden>
          <span
            className="kbk-livestream-blink"
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 999,
              background: '#9146FF',
              color: '#9146FF',
              animationDelay: '0.4s',
            }}
          />
          <span
            className="kbk-livestream-blink"
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 999,
              background: '#FF3B6B',
              color: '#FF3B6B',
              animationDelay: '0.2s',
            }}
          />
          <span
            className="kbk-livestream-blink"
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 999,
              background: '#9146FF',
              color: '#9146FF',
              animationDelay: '0s',
            }}
          />
        </div>
      </div>
    </Link>
  );
}
