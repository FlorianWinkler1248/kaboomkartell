'use client';

/**
 * ShowcaseRail — Client-Teil der Showcase-Sektion (ADR-041).
 *
 * Rendert pro Showcase-Playlist eine Karten-Reihe: SOUNDCLOUD-Tracks als
 * Lazy-Embed-Karten (iframe erst nach Tap), LOCAL-Tracks als Link auf die
 * Track-Seite. Es ist immer höchstens EIN Embed offen (expandedId) — beim
 * Öffnen eines neuen klappt das alte zu.
 *
 * Kein-Blenden-Regel: keine eigenen Zähler an den Karten — die echten Plays
 * zeigt das SC-Widget des Künstlers selbst.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink, Music2 } from 'lucide-react';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { SOUNDCLOUD_ORANGE, GENRE_ACCENT, isGenre } from '@/lib/constants';
import { SafeImg } from '@/components/ui/SafeImg';
import SoundCloudEmbedLazy from '@/components/player/SoundCloudEmbedLazy';
import AuraLikeButton from '@/components/kbk/AuraLikeButton';

export interface ShowcaseTrackItem {
  id: string;
  title: string;
  slug: string;
  trackType: string;
  genre: string | null;
  duration: number;
  artistLabel: string;
  artworkUrl: string | null;
  soundcloudUrl: string | null;
  soundcloudEmbedUrl: string | null;
}

export interface ShowcasePlaylistItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tracks: ShowcaseTrackItem[];
}

export default function ShowcaseRail({ playlists }: { playlists: ShowcasePlaylistItem[] }) {
  const t = useTranslations('showcase');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 20 }}>
      {playlists.map((playlist) => (
        <div key={playlist.id}>
          {/* Playlist-Kopfzeile: Name + Link zur vollen Playlist */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 900,
                color: '#fff',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {playlist.name}
            </span>
            <Link
              href={`/playlists/${playlist.slug}`}
              prefetch={false}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: SOUNDCLOUD_ORANGE,
                letterSpacing: '0.15em',
                textDecoration: 'none',
                textTransform: 'uppercase',
              }}
            >
              {t('openPlaylist')} →
            </Link>
          </div>

          <div
            className="kbk-subpage-grid-3"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 14,
            }}
          >
            {playlist.tracks.map((track) => {
              const isSC = track.trackType === 'SOUNDCLOUD' && !!track.soundcloudEmbedUrl;
              const genreAccent =
                track.genre && isGenre(track.genre) ? GENRE_ACCENT[track.genre] : SOUNDCLOUD_ORANGE;

              return (
                <div
                  key={track.id}
                  className="kbk-obsidian framed"
                  style={{
                    ...obsidianFrameVars(SOUNDCLOUD_ORANGE),
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  {/* Medien-Zone: SC = Lazy-Embed, LOCAL = Link mit Artwork */}
                  {isSC ? (
                    <SoundCloudEmbedLazy
                      embedUrl={track.soundcloudEmbedUrl!}
                      trackTitle={track.title}
                      soundcloudUrl={track.soundcloudUrl ?? undefined}
                      artworkUrl={track.artworkUrl}
                      expanded={expandedId === track.id}
                      onExpand={() => setExpandedId(track.id)}
                    />
                  ) : (
                    <Link
                      href={`/tracks/${track.slug}`}
                      prefetch={false}
                      aria-label={t('openTrack', { title: track.title })}
                      style={{
                        position: 'relative',
                        display: 'block',
                        height: 166,
                        background: 'rgba(0,0,0,0.4)',
                        overflow: 'hidden',
                      }}
                    >
                      <SafeImg
                        src={track.artworkUrl}
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
                    </Link>
                  )}

                  {/* Info-Zone: Titel, Artist, Genre + Link-out */}
                  <div style={{ padding: '12px 14px' }}>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#fff',
                        letterSpacing: '0.02em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {track.title}
                    </p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.6)',
                        letterSpacing: '0.05em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {track.artistLabel}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      {track.genre ? (
                        <span
                          style={{
                            padding: '2px 8px',
                            background: `${genreAccent}22`,
                            color: genreAccent,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            letterSpacing: '0.15em',
                            textTransform: 'uppercase',
                            border: `1px solid ${genreAccent}44`,
                          }}
                        >
                          {track.genre}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        {track.soundcloudUrl && (
                          <a
                            href={track.soundcloudUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              color: SOUNDCLOUD_ORANGE,
                              letterSpacing: '0.1em',
                              textDecoration: 'none',
                              minHeight: 24,
                            }}
                          >
                            {t('listenOn')} <ExternalLink size={11} />
                          </a>
                        )}
                        {/* Aura+-Like (ADR-041) — speist My Playlist */}
                        <AuraLikeButton
                          track={{
                            id: track.id,
                            title: track.title,
                            slug: track.slug,
                            trackType: track.trackType,
                            duration: track.duration,
                            coverUrl: track.artworkUrl,
                            genre: track.genre,
                            artistLabel: track.artistLabel,
                            soundcloudUrl: track.soundcloudUrl,
                            soundcloudEmbedUrl: track.soundcloudEmbedUrl,
                          }}
                        />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
