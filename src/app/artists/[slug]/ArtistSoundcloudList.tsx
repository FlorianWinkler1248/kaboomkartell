'use client';

/**
 * SoundCloud-Discography-Grid der öffentlichen Artist-Seite (ADR-041).
 *
 * Client-Wrapper für SoundCloudEmbedLazy: hält den expanded-State — nur EIN
 * Embed offen zugleich (Muster Showcase-Grid). Ruhe-Ansicht bleibt iframe-frei
 * (Datenschutz + Performance), erst der Tap mountet das echte Widget.
 */

import { useState } from 'react';
import SoundCloudEmbedLazy from '@/components/player/SoundCloudEmbedLazy';

export interface ScTrackItem {
  id: string;
  title: string;
  embedUrl: string;
  soundcloudUrl?: string;
  artworkUrl: string | null;
}

export default function ArtistSoundcloudList({ tracks }: { tracks: ScTrackItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="kbk-subpage-grid-3">
      {tracks.map((track) => (
        <div key={track.id}>
          <SoundCloudEmbedLazy
            embedUrl={track.embedUrl}
            trackTitle={track.title}
            soundcloudUrl={track.soundcloudUrl}
            artworkUrl={track.artworkUrl}
            expanded={expandedId === track.id}
            onExpand={() => setExpandedId(track.id)}
          />
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.7)',
              margin: '8px 0 0',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
            title={track.title}
          >
            {track.title}
          </p>
        </div>
      ))}
    </div>
  );
}
