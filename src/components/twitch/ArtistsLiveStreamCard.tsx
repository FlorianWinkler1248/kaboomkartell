'use client';

/**
 * <ArtistsLiveStreamCard /> (v2.30, ADR-005 Sektion E)
 *
 * /artists-Page-Modul für den Twitch-Live-Slot. Drei Zustände:
 *   - "live": LIVE-Marke, Kanal, Zuschauer, Laufzeit, Titel und Embed
 *   - "offline" (configured): Channel-Login + "OFFLINE · poll every 30s"
 *   - "coming-soon" (unconfigured): bisheriger Coming-Soon-Block
 *
 * Polling läuft alle 30s gegen /api/twitch/live-status. Server-side hängt
 * dort ein 30s-Cache vor Helix, also kostet das Polling pro Browser
 * effektiv 1 Helix-Request/Minute pro Server.
 */

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { TwitchEmbed } from './TwitchEmbed';

const RED = '#E63B2E';
const POLL_MS = 30_000;

type Status =
  | { state: 'loading' }
  | { state: 'coming-soon'; channel: null }
  | { state: 'offline'; channel: string }
  | {
      state: 'live';
      channel: string;
      title: string;
      viewerCount: number;
      startedAt: string;
    };

type ApiResponse = {
  configured: boolean;
  channel: string | null;
  live: boolean;
  title?: string;
  viewerCount?: number;
  startedAt?: string;
};

export function ArtistsLiveStreamCard() {
  const t = useTranslations('widgetsUi');
  const [status, setStatus] = useState<Status>({ state: 'loading' });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/twitch/live-status');
      if (!res.ok) {
        // Bei API-Crash zeigen wir die Coming-Soon-Fallback-UI statt
        // einen leeren Block; User merkt nicht direkt dass Helix down ist.
        setStatus({ state: 'coming-soon', channel: null });
        return;
      }
      const data: ApiResponse = await res.json();
      if (!data.configured || !data.channel) {
        setStatus({ state: 'coming-soon', channel: null });
        return;
      }
      if (data.live && data.title && typeof data.viewerCount === 'number' && data.startedAt) {
        setStatus({
          state: 'live',
          channel: data.channel,
          title: data.title,
          viewerCount: data.viewerCount,
          startedAt: data.startedAt,
        });
      } else {
        setStatus({ state: 'offline', channel: data.channel });
      }
    } catch (err) {
      console.warn('[ArtistsLiveStreamCard] poll failed:', err);
      setStatus({ state: 'coming-soon', channel: null });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  if (status.state === 'live') {
    return (
      <div
        // Rahmen steht still, solange der Stream läuft (kbk-frame-still).
        className="kbk-obsidian framed kbk-frame-red kbk-frame-still"
        style={{ ...obsidianFrameVars(RED), padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="kbk-live-marke">
            <i className="kbk-live-punkt" aria-hidden />
            {t('liveBadge')}
          </span>
          <span className="kbk-live-kanal">
            Twitch <span>/</span> {status.channel}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            <span className="kbk-live-zahl">{t('watching', { count: status.viewerCount })}</span>
            <LiveSince startedAt={status.startedAt} />
          </div>
        </div>
        <h3
          className="font-heading"
          style={{
            fontSize: 'clamp(18px, 2.6vw, 24px)',
            fontWeight: 900,
            margin: 0,
            color: '#fff',
            letterSpacing: '0.02em',
            lineHeight: 1.25,
          }}
        >
          {status.title}
        </h3>
        <div className="kbk-live-bild">
          <TwitchEmbed channel={status.channel} muted autoplay />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="kbk-live-zahl">{t('liveSoundHint')}</span>
          <a
            className="kbk-live-knopf"
            href={`https://www.twitch.tv/${status.channel}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('openOnTwitch')}
          </a>
        </div>
      </div>
    );
  }

  if (status.state === 'offline') {
    return (
      <div
        className="kbk-obsidian framed kbk-frame-red"
        style={{
          ...obsidianFrameVars(RED),
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: RED,
            letterSpacing: '0.22em',
          }}
        >
          ⌂ TWITCH · {status.channel}
        </div>
        <h3
          className="font-heading"
          style={{
            fontSize: 'clamp(20px, 3.5vw, 30px)',
            fontWeight: 900,
            margin: 0,
            color: '#fff',
            letterSpacing: '0.02em',
          }}
        >
          {t('streamingSlot')}
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'rgba(255,255,255,0.7)',
            lineHeight: 1.6,
            margin: 0,
            maxWidth: 540,
          }}
        >
          {t('streamingSlotOfflineHint')}
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'rgba(255,255,255,0.45)',
            marginTop: 4,
            letterSpacing: '0.08em',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 999,
              background: RED,
              opacity: 0.45,
            }}
          />
          {t('offlinePoll')}
        </div>
        <a
          href={`https://www.twitch.tv/${status.channel}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: RED,
            letterSpacing: '0.1em',
            textDecoration: 'none',
            marginTop: 4,
          }}
        >
          {t('openOnTwitch')}
        </a>
      </div>
    );
  }

  // 'loading' und 'coming-soon' zeigen denselben Placeholder.
  return (
    <div
      className="kbk-obsidian framed kbk-frame-red"
      style={{
        ...obsidianFrameVars(RED),
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: RED,
          letterSpacing: '0.22em',
        }}
      >
        ⌂ TWITCH · {t('comingSoon')}
      </div>
      <h3
        className="font-heading"
        style={{
          fontSize: 'clamp(20px, 3.5vw, 30px)',
          fontWeight: 900,
          margin: 0,
          color: '#fff',
          letterSpacing: '0.02em',
        }}
      >
        {t('streamingSlot')}
      </h3>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'rgba(255,255,255,0.7)',
          lineHeight: 1.6,
          margin: 0,
          maxWidth: 540,
        }}
      >
        {t('streamingSlotComingSoonHint')}
      </p>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'rgba(255,255,255,0.45)',
          marginTop: 4,
          letterSpacing: '0.08em',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 999,
            background: RED,
            opacity: 0.5,
          }}
        />
        {t('offlinePoll')}
      </div>
    </div>
  );
}

/** Laufzeit seit Streamstart, einmal je Minute neu gerechnet. */
function LiveSince({ startedAt }: { startedAt: string }) {
  const t = useTranslations('widgetsUi');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  const duration = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  return <span className="kbk-live-zahl">{t('liveSince', { duration })}</span>;
}
