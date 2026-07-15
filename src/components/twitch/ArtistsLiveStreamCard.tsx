'use client';

/**
 * <ArtistsLiveStreamCard /> (v2.30, ADR-005 Sektion E)
 *
 * /artists-Page-Modul für den Twitch-Live-Slot. Drei Zustände:
 *   - "live": Embed wird gerendert + Title + Viewer-Count
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
        className="kbk-obsidian framed kbk-frame-red"
        style={{ ...obsidianFrameVars(RED), padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: 999,
                background: RED,
                boxShadow: `0 0 12px ${RED}`,
                animation: 'kbk-pulse 1.2s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: RED,
                letterSpacing: '0.22em',
              }}
            >
              {t('onAir')} · TWITCH · {status.channel}
            </span>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.6)',
              letterSpacing: '0.05em',
            }}
          >
            👥 {t('watching', { count: status.viewerCount })}
          </span>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: '#fff',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {status.title}
        </p>
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <TwitchEmbed channel={status.channel} muted autoplay />
          </div>
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
