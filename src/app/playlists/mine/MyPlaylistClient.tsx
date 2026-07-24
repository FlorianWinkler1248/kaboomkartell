'use client';

/**
 * MyPlaylistClient — die persönliche Playlist aus Aura+-Likes (ADR-041).
 *
 * Vier Zustände:
 *  1. anon, 0 Likes    → Empty-State mit Register-CTA
 *  2. anon, Session-Likes → Liste + „session only"-Banner
 *  3. eingeloggt, 0 Likes → Empty-State („Hit AURA+…")
 *  4. eingeloggt, Likes   → Vollansicht
 *
 * LOCAL-Likes spielen über die eigene Audio-Pipeline (Play All / Zeilen-Play,
 * gleiche Naht wie PlaylistDetailClient). SOUNDCLOUD-Likes leben in einer
 * eigenen „FROM SOUNDCLOUD"-Sektion als Lazy-Embeds — sie laufen nicht im
 * MINE-Channel (kein Auto-Advance durch fremde Player).
 */

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Play, Music2, Headphones } from 'lucide-react';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { useMyPlaylist, type LikedTrack } from '@/components/providers/LikesProvider';
import AuraLikeButton from '@/components/kbk/AuraLikeButton';
import SoundCloudEmbedLazy from '@/components/player/SoundCloudEmbedLazy';
import { SafeImg } from '@/components/ui/SafeImg';
import { formatTime } from '@/lib/utils';
import type { PlayerTrack } from '@/types';

const MINE_GREY = '#9AA0A8';

function toPlayerTrack(t: LikedTrack): PlayerTrack {
  return {
    id: t.id,
    title: t.title,
    artist: t.artistLabel,
    duration: t.duration,
    url: t.streamUrl,
    coverUrl: t.coverUrl ?? undefined,
    isLocal: false,
  };
}

export default function MyPlaylistClient() {
  const t = useTranslations('myPlaylist');
  const { status } = useSession();
  const likes = useMyPlaylist();
  const { playTracks, audio } = usePlayer();
  const [expandedScId, setExpandedScId] = useState<string | null>(null);

  const localTracks = likes.likedTracks.filter((l) => l.trackType === 'LOCAL');
  const scTracks = likes.likedTracks.filter((l) => l.trackType === 'SOUNDCLOUD');
  const isEmpty = likes.likedTracks.length === 0;
  const loading = status === 'loading' || !likes.ready;

  const playFrom = (index: number) => {
    playTracks(localTracks.map(toPlayerTrack), index);
  };

  return (
    <section
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 960 }}>
        {/* Header */}
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: MINE_GREY,
            letterSpacing: '0.2em',
            margin: '0 0 10px',
            textTransform: 'uppercase',
          }}
        >
          /M/ {t('kicker')}
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '-0.01em',
            lineHeight: 0.95,
            margin: '0 0 8px',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ color: MINE_GREY, textShadow: `0 0 24px ${MINE_GREY}` }}>
            {t('title')}
          </span>
        </h1>
        {!isEmpty && (
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'rgba(255,255,255,0.6)',
              letterSpacing: '0.05em',
              margin: '0 0 24px',
              textTransform: 'uppercase',
            }}
          >
            {t('likedCount', { count: likes.likedTracks.length })}
          </p>
        )}

        {/* Session-Banner (anon mit Likes) */}
        {likes.isAnon && !isEmpty && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: 16,
              border: '1px dashed rgba(255,255,255,0.3)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.75)',
              letterSpacing: '0.05em',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
              justifyContent: 'space-between',
            }}
          >
            <span>{t('sessionBanner')}</span>
            <Link
              href="/register?callbackUrl=/playlists/mine"
              style={{
                color: '#3FCF4A',
                textDecoration: 'none',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              {t('emptyAnonCta')} →
            </Link>
          </div>
        )}

        {/* Empty-States */}
        {!loading && isEmpty && (
          <div
            className="kbk-obsidian framed"
            style={{ padding: 40, textAlign: 'center' }}
          >
            <Music2
              size={40}
              color="rgba(255,255,255,0.25)"
              style={{ margin: '0 auto 12px', display: 'block' }}
            />
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 900,
                color: '#fff',
                letterSpacing: '0.08em',
                marginBottom: 8,
              }}
            >
              {likes.isAnon ? t('emptyAnonTitle') : t('emptyUserTitle')}
            </div>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'rgba(255,255,255,0.6)',
                lineHeight: 1.6,
                maxWidth: 460,
                margin: '0 auto',
              }}
            >
              {likes.isAnon ? t('emptyAnonBody') : t('emptyUserBody')}
            </p>
            {likes.isAnon && (
              <Link
                href="/register?callbackUrl=/playlists/mine"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 18,
                  background: '#3FCF4A',
                  color: '#0A0B0C',
                  padding: '12px 22px',
                  minHeight: 44,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: 12,
                  letterSpacing: '0.15em',
                  textDecoration: 'none',
                  textTransform: 'uppercase',
                  clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
                }}
              >
                {t('emptyAnonCta')}
              </Link>
            )}
          </div>
        )}

        {/* LOCAL-Likes: abspielbare Liste */}
        {localTracks.length > 0 && (
          <>
            <button
              onClick={() => playFrom(0)}
              style={{
                marginBottom: 14,
                background: MINE_GREY,
                color: '#0A0B0C',
                border: 'none',
                padding: '12px 22px',
                minHeight: 44,
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: '0.15em',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
                textTransform: 'uppercase',
              }}
            >
              <Play size={16} fill="currentColor" />
              {t('playAll', { count: localTracks.length })}
            </button>

            <div
              className="kbk-obsidian framed"
              style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              {localTracks.map((track, index) => {
                const isCurrentTrack = audio.currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      background: isCurrentTrack ? 'rgba(154,160,168,0.10)' : 'transparent',
                      border: isCurrentTrack
                        ? '1px solid rgba(154,160,168,0.35)'
                        : '1px solid transparent',
                    }}
                  >
                    <button
                      onClick={() => playFrom(index)}
                      aria-label={track.title}
                      style={{
                        width: 32,
                        height: 32,
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: isCurrentTrack ? MINE_GREY : 'rgba(255,255,255,0.55)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                      }}
                    >
                      {isCurrentTrack && audio.isPlaying ? (
                        <Headphones size={16} color={MINE_GREY} />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </button>

                    <div
                      style={{
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <SafeImg
                        src={track.coverUrl}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        fallback={<Music2 size={14} color="rgba(255,255,255,0.3)" />}
                      />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      {track.slug ? (
                        <Link
                          href={`/tracks/${track.slug}`}
                          style={{
                            display: 'block',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            fontWeight: 600,
                            color: isCurrentTrack ? MINE_GREY : '#fff',
                            textDecoration: 'none',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {track.title}
                        </Link>
                      ) : (
                        <span
                          style={{
                            display: 'block',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#fff',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {track.title}
                        </span>
                      )}
                      <p
                        style={{
                          margin: 0,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'rgba(255,255,255,0.55)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {track.artistLabel}
                        {track.genre ? ` — ${track.genre}` : ''}
                      </p>
                    </div>

                    <span
                      style={{
                        flexShrink: 0,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.5)',
                        width: 44,
                        textAlign: 'right',
                      }}
                    >
                      {formatTime(track.duration)}
                    </span>

                    {/* Unlike = dieselbe Aura+-Geste */}
                    <AuraLikeButton
                      track={{
                        id: track.id,
                        title: track.title,
                        slug: track.slug,
                        trackType: track.trackType,
                        duration: track.duration,
                        coverUrl: track.coverUrl,
                        genre: track.genre,
                        artistLabel: track.artistLabel,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* SOUNDCLOUD-Likes: eigene Embed-Sektion */}
        {scTracks.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: '#FF5500',
                letterSpacing: '0.2em',
                fontWeight: 700,
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              /SC/ {t('fromSoundcloud')}
            </div>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'rgba(255,255,255,0.5)',
                margin: '0 0 14px',
                letterSpacing: '0.05em',
              }}
            >
              {t('fromSoundcloudHint')}
            </p>
            <div
              className="kbk-subpage-grid-3"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}
            >
              {scTracks.map((track) => (
                <div
                  key={track.id}
                  className="kbk-obsidian framed"
                  style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                >
                  {track.soundcloudEmbedUrl ? (
                    <SoundCloudEmbedLazy
                      embedUrl={track.soundcloudEmbedUrl}
                      trackTitle={track.title}
                      soundcloudUrl={track.soundcloudUrl ?? undefined}
                      artworkUrl={track.coverUrl}
                      expanded={expandedScId === track.id}
                      onExpand={() => setExpandedScId(track.id)}
                    />
                  ) : null}
                  <div
                    style={{
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#fff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {track.title}
                      </p>
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          color: 'rgba(255,255,255,0.55)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {track.artistLabel}
                      </p>
                    </div>
                    <AuraLikeButton
                      track={{
                        id: track.id,
                        title: track.title,
                        slug: track.slug,
                        trackType: track.trackType,
                        duration: track.duration,
                        coverUrl: track.coverUrl,
                        genre: track.genre,
                        artistLabel: track.artistLabel,
                        soundcloudUrl: track.soundcloudUrl,
                        soundcloudEmbedUrl: track.soundcloudEmbedUrl,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
