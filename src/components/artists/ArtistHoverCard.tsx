'use client';

/**
 * ArtistHoverCard — Erweiterte Artist-Karte mit Audio-Snippet on-hover.
 *
 * v2.26 (07.05.2026): Movement-Welle 1 für /artists.
 * - Beim Hover laueft ein 4-Sekunden-Snippet des ersten Tracks (lazy gefetcht)
 * - Pulse-Border-Animation in Akzentfarbe während Hover
 * - Live-Indicator-Dot für AI-Residenten (Boomy ist immer "live")
 * - Touch-fallback: erster Tap startet Snippet, zweiter Tap navigiert zum Profil
 *
 * Eingebaut von der Server-Component /artists/page.tsx — der Server liefert
 * bereits ersten Track als Snippet-Source. Audio-Element wird lazy erzeugt
 * und bekommt `preload=none`, damit kein Bandwidth verbraten wird, wenn der
 * User die Karten gar nicht beruehrt.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { obsidianFrameVars } from '@/lib/obsidian-frame';

interface ArtistHoverCardProps {
  username: string;
  name: string;
  badgeLabel: string;
  accent: string;
  avatarUrl: string | null;
  /** Stream-URL des ersten Tracks für das 4s-Snippet, oder null. */
  snippetUrl: string | null;
  /** Anzahl Tracks unter dem Artist — für kleine Subtitle-Note. */
  trackCount: number;
  /** Wenn true: pulsing Live-Dot (z.B. Boomy ist immer wach). */
  alwaysLive?: boolean;
  /** Index in der Liste — für Staggered-Fade-In Animation. */
  index?: number;
}

export default function ArtistHoverCard({
  username,
  name,
  badgeLabel,
  accent,
  avatarUrl,
  snippetUrl,
  trackCount,
  alwaysLive = false,
  index = 0,
}: ArtistHoverCardProps) {
  const t = useTranslations('artists');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isHover, setIsHover] = useState(false);
  const [tappedOnce, setTappedOnce] = useState(false);

  // Audio-Element on-demand erzeugen
  useEffect(() => {
    if (!snippetUrl) return;
    if (!audioRef.current) {
      const a = new Audio();
      a.src = snippetUrl;
      a.preload = 'none';
      a.volume = 0.5;
      audioRef.current = a;
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [snippetUrl]);

  const startSnippet = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
    // Nach 4 Sekunden automatisch ausfaden (Stop)
    window.setTimeout(() => {
      if (audioRef.current && !isHover) return;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }, 4200);
  };

  const stopSnippet = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!snippetUrl) return;
    if (!tappedOnce) {
      e.preventDefault();
      setTappedOnce(true);
      setIsHover(true);
      startSnippet();
      window.setTimeout(() => setTappedOnce(false), 5000);
    }
  };

  return (
    <Link
      href={`/profile/${username}`}
      className="kbk-obsidian framed kbk-artist-card"
      style={{
        display: 'block',
        textDecoration: 'none',
        ...obsidianFrameVars(accent),
        padding: 20,
        position: 'relative',
        animationDelay: `${index * 60}ms`,
      }}
      onMouseEnter={() => {
        setIsHover(true);
        startSnippet();
      }}
      onMouseLeave={() => {
        setIsHover(false);
        stopSnippet();
      }}
      onTouchStart={handleTouchStart}
      data-hovering={isHover ? 'true' : 'false'}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div
          style={{
            width: 56,
            height: 56,
            background: `${accent}20`,
            border: `1px solid ${accent}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accent,
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 900,
            flexShrink: 0,
            overflow: 'hidden',
            position: 'relative',
            transition: 'transform 0.25s ease',
            transform: isHover ? 'scale(1.06)' : 'scale(1)',
          }}
        >
          {avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatarUrl}
              alt={name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            name.charAt(0).toUpperCase()
          )}
          {(alwaysLive || isHover) && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: -3,
                right: -3,
                width: 12,
                height: 12,
                borderRadius: 999,
                background: '#3FCF4A',
                border: '2px solid #0A0B0C',
                animation: 'kk-live-ping 1.6s cubic-bezier(0,0,0.2,1) infinite',
              }}
            />
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              fontWeight: 900,
              color: '#fff',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: accent,
              letterSpacing: '0.18em',
              marginTop: 4,
            }}
          >
            {badgeLabel}
          </div>
          {trackCount > 0 && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'rgba(255,255,255,0.45)',
                marginTop: 4,
                letterSpacing: '0.05em',
              }}
            >
              {t('tracksLive', { count: trackCount })}
            </div>
          )}
        </div>
        {snippetUrl && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: isHover ? accent : 'rgba(255,255,255,0.35)',
              letterSpacing: '0.1em',
              alignSelf: 'flex-start',
              marginTop: 4,
              transition: 'color 0.2s',
            }}
          >
            {isHover ? `▶ ${t('play')}` : t('hover')}
          </div>
        )}
      </div>
    </Link>
  );
}
