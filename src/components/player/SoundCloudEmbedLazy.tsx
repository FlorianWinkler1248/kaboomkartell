'use client';

/**
 * SoundCloudEmbedLazy — Facade um SoundCloudEmbed (ADR-041, Showcase).
 *
 * Ruhe-Ansicht = Artwork + Play-Overlay, KEIN iframe — kein Third-Party-Request
 * und keine SoundCloud-Cookies vor der expliziten User-Geste (Datenschutz +
 * Performance bei Grids mit vielen Embeds). Erst beim Tap wird das echte
 * Widget gemountet (autoPlay, da User-Geste vorliegt).
 *
 * Beim Expand wird eigenes KBK-Audio gestoppt (Radio-Modus verlassen +
 * pausieren), damit nie zwei Quellen parallel spielen — Muster wie
 * playTrackAtIndex im PlayerProvider.
 *
 * Controlled Component: der Parent hält den expanded-State (z.B. „nur ein
 * Embed offen zugleich" im Showcase-Grid).
 */

import { useTranslations } from 'next-intl';
import { Play, Music2 } from 'lucide-react';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { SafeImg } from '@/components/ui/SafeImg';
import { SOUNDCLOUD_ORANGE } from '@/lib/constants';
import SoundCloudEmbed from './SoundCloudEmbed';

interface SoundCloudEmbedLazyProps {
  embedUrl: string;
  trackTitle: string;
  soundcloudUrl?: string;
  artworkUrl?: string | null;
  expanded: boolean;
  onExpand: () => void;
}

export default function SoundCloudEmbedLazy({
  embedUrl,
  trackTitle,
  soundcloudUrl,
  artworkUrl,
  expanded,
  onExpand,
}: SoundCloudEmbedLazyProps) {
  const t = useTranslations('showcase');
  const { audio, radioMode, exitRadioMode } = usePlayer();

  const handleExpand = () => {
    // Eigenes Audio stoppen, bevor das SC-Widget übernimmt.
    if (radioMode) exitRadioMode();
    if (audio.isPlaying) audio.pause();
    onExpand();
  };

  if (expanded) {
    return (
      <SoundCloudEmbed
        embedUrl={embedUrl}
        trackTitle={trackTitle}
        soundcloudUrl={soundcloudUrl}
        autoPlay
      />
    );
  }

  return (
    <button
      onClick={handleExpand}
      aria-label={t('playVia', { title: trackTitle })}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        height: 166,
        padding: 0,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.4)',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <SafeImg
        src={artworkUrl}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        fallback={
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Music2 size={40} color="rgba(255,255,255,0.25)" />
          </div>
        }
      />
      {/* Abdunkelnder Overlay + Play-Kreis (Touch-Target ≥44px) */}
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
          transition: 'background 0.15s ease',
        }}
      >
        <span
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: SOUNDCLOUD_ORANGE,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 24px ${SOUNDCLOUD_ORANGE}66`,
          }}
        >
          <Play size={22} fill="#0A0B0C" color="#0A0B0C" style={{ marginLeft: 3 }} />
        </span>
      </span>
      {/* Kleiner SC-Hinweis unten rechts — ehrlich zeigen, dass extern gespielt wird */}
      <span
        style={{
          position: 'absolute',
          right: 8,
          bottom: 8,
          padding: '2px 7px',
          background: 'rgba(0,0,0,0.7)',
          color: SOUNDCLOUD_ORANGE,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.15em',
        }}
      >
        SOUNDCLOUD
      </span>
    </button>
  );
}
