'use client';

/**
 * TrackDetailClient — Client-Component für die Track-Detail-Seite (Cockpit-Style v2.27).
 *
 * Zeigt Track-Artwork, Info, Play-Button (mit PlayerProvider-Integration),
 * SoundCloud-Embed für SC-Tracks, Beschreibung und verwandte Tracks.
 *
 * Visual-Drift-Migration: kompletter Switch von Tailwind-Utility-Klassen auf
 * Inline-Styles + `kbk-obsidian framed`-Cards + Hex-Farben (rasta-green #3FCF4A,
 * rasta-red #E63B2E, rasta-yellow #F5D02E). Funktionalität (Player-Hooks,
 * useToast, share, Voting-Stats, JSON-LD via Server-Component) bleibt 100%
 * unverändert.
 */

import { useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { showVanity } from '@/lib/vanity';
import {
  Play,
  Pause,
  Music2,
  Clock,
  Disc3,
  Activity,
  BarChart3,
  ArrowLeft,
  Share2,
} from 'lucide-react';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { useToast } from '@/components/providers/ToastProvider';
import SoundCloudEmbed from '@/components/player/SoundCloudEmbed';
import AiBadge from '@/components/tracks/AiBadge';
import VotingStats from '@/components/tracks/VotingStats';
import { formatTime } from '@/lib/utils';
import { SafeImg } from '@/components/ui/SafeImg';
import AuraLikeButton from '@/components/kbk/AuraLikeButton';

interface TrackData {
  id: string;
  title: string;
  slug: string;
  trackType: string;
  duration: number;
  genre: string | null;
  bpm: number | null;
  description: string | null;
  playCount: number;
  coverUrl: string | null;
  soundcloudUrl: string | null;
  soundcloudEmbedUrl: string | null;
  soundcloudArtwork: string | null;
  artistName: string;
  artistUsername: string | null;
  streamUrl: string | null;
  // AI-Disclosure
  aiDisclosure: string | null;
  aiSource: string | null;
  // Voting-Stats
  auraCount: number;
  susCount: number;
  totalVotes: number;
  susPercentage: number;
}

interface RelatedTrack {
  id: string;
  title: string;
  slug: string;
  trackType: string;
  genre: string | null;
  duration: number;
  coverUrl: string | null;
  artistName: string;
}

interface TrackDetailClientProps {
  track: TrackData;
  relatedTracks: RelatedTrack[];
}

export default function TrackDetailClient({ track, relatedTracks }: TrackDetailClientProps) {
  const t = useTranslations('track');
  const { audio, playlist, playTrackAtIndex } = usePlayer();
  const { toast } = useToast();

  const artwork = track.coverUrl || track.soundcloudArtwork;
  const isSoundcloud = track.trackType === 'SOUNDCLOUD';

  // Track in den Player laden und abspielen
  const handlePlay = useCallback(() => {
    // PlayerTrack-Format erstellen — aiDisclosure mit durchreichen damit
    // die AI-Pill im MiniPlayer rendert (v2.14b-Fix).
    const playerTrack = {
      id: track.id,
      title: track.title,
      artist: track.artistName,
      duration: track.duration || 0,
      url: isSoundcloud ? (track.soundcloudUrl || '') : (track.streamUrl || ''),
      coverUrl: artwork || undefined,
      isLocal: false,
      isSoundcloud,
      soundcloudEmbedUrl: track.soundcloudEmbedUrl || undefined,
      aiDisclosure: track.aiDisclosure as 'human' | 'ai_assisted' | 'ai_generated' | null,
    };

    // Prüfen ob Track bereits in der Playlist ist
    const existingIndex = playlist.tracks.findIndex((t) => t.id === track.id);

    if (existingIndex >= 0) {
      // Track ist schon in der Playlist — einfach abspielen oder pausieren
      if (existingIndex === playlist.currentIndex && audio.isPlaying) {
        audio.pause();
        return;
      }
      playTrackAtIndex(existingIndex);
    } else {
      // Track an den Anfang der Playlist setzen und abspielen
      const newTracks = [playerTrack, ...playlist.tracks];
      playlist.setTracks(newTracks);
      // Kleiner Delay damit State sich aktualisiert
      setTimeout(() => playTrackAtIndex(0), 50);
    }
  }, [track, isSoundcloud, artwork, playlist, audio, playTrackAtIndex]);

  // Aktuellen Play-State tracken
  const isCurrentTrack = playlist.tracks[playlist.currentIndex]?.id === track.id;
  const showPause = isCurrentTrack && audio.isPlaying;

  // Share-Handler
  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      toast({ type: 'success', message: t('linkCopied') });
    }).catch(() => {});
  }, [toast, t]);

  return (
    <section
      style={{
        minHeight: '70vh',
        padding: '40px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 960, margin: '0 auto' }}>
        {/* Zurück-Link — Mono-Slug-Pattern */}
        <Link
          href="/library"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.6)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            marginBottom: 24,
          }}
        >
          <ArrowLeft size={14} />
          <span>{t('backToLibrary')}</span>
        </Link>

        {/* Cockpit-Header — Slug + H1 + Mono-Sub */}
        <div style={{ marginBottom: 28 }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#3FCF4A',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              margin: '0 0 10px',
            }}
          >
            {t('eyebrowTrack')}
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
            {track.title}
          </h1>
          {track.artistUsername ? (
            <Link
              href={`/profile/${track.artistUsername}`}
              style={{
                display: 'inline-block',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: '#3FCF4A',
                letterSpacing: '0.05em',
                textDecoration: 'none',
              }}
            >
              {t('byArtist', { artist: track.artistName })}
            </Link>
          ) : (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'rgba(255,255,255,0.6)',
                letterSpacing: '0.05em',
                margin: 0,
              }}
            >
              {t('byArtist', { artist: track.artistName })}
            </p>
          )}
        </div>

        {/* Hero: Artwork + Info als Vulkanglas-Card */}
        <div
          className="kbk-obsidian framed"
          style={{
            padding: 28,
            marginBottom: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 28,
              flexWrap: 'wrap',
            }}
          >
            {/* Artwork */}
            <div style={{ width: '100%', maxWidth: 320, flex: '0 0 auto' }}>
              <div
                style={{
                  aspectRatio: '1 / 1',
                  position: 'relative',
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}
              >
                {isSoundcloud && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      padding: '4px 10px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      background: 'rgba(245,124,0,0.9)',
                      color: '#fff',
                      zIndex: 10,
                    }}
                  >
                    SOUNDCLOUD
                  </span>
                )}
                <SafeImg
                  src={artwork}
                  alt={track.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
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
                      <Music2 size={80} color="rgba(255,255,255,0.2)" />
                    </div>
                  }
                />
              </div>
            </div>

            {/* Track-Info */}
            <div
              style={{
                flex: '1 1 280px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 16,
              }}
            >
              {/* AI-Badge */}
              {track.aiDisclosure && (
                <div>
                  <AiBadge
                    aiDisclosure={track.aiDisclosure}
                    aiSource={track.aiSource}
                    susPercentage={track.susPercentage}
                    size="md"
                  />
                </div>
              )}

              {/* Voting-Stats — immer anzeigen als Einladung zum Voten.
                  Daneben die Aura+-Like-Geste (ADR-041): speist My Playlist. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <VotingStats
                  auraCount={track.auraCount}
                  susCount={track.susCount}
                  totalVotes={track.totalVotes}
                  susPercentage={track.susPercentage}
                  size="md"
                />
                <AuraLikeButton
                  size="md"
                  track={{
                    id: track.id,
                    title: track.title,
                    slug: track.slug,
                    trackType: track.trackType,
                    duration: track.duration,
                    coverUrl: artwork,
                    genre: track.genre,
                    artistLabel: track.artistName,
                    soundcloudUrl: track.soundcloudUrl,
                    soundcloudEmbedUrl: track.soundcloudEmbedUrl,
                  }}
                />
              </div>

              {/* Metadata-Pillen */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {track.genre && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      background: 'rgba(245,208,46,0.1)',
                      border: '1px solid rgba(245,208,46,0.3)',
                      color: '#F5D02E',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <Disc3 size={12} />
                    {track.genre}
                  </span>
                )}
                {track.bpm && track.bpm > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      background: 'rgba(230,59,46,0.1)',
                      border: '1px solid rgba(230,59,46,0.3)',
                      color: '#E63B2E',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      letterSpacing: '0.1em',
                    }}
                  >
                    <Activity size={12} />
                    {track.bpm} BPM
                  </span>
                )}
                {track.duration > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.85)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      letterSpacing: '0.1em',
                    }}
                  >
                    <Clock size={12} />
                    {formatTime(track.duration)}
                  </span>
                )}
                {/* Vanity-Gate: Play-Count erst ab echtem Wert (sonst „0 plays"). */}
                {showVanity(track.playCount, 'playCount') && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      background: 'rgba(63,207,74,0.1)',
                      border: '1px solid rgba(63,207,74,0.3)',
                      color: '#3FCF4A',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <BarChart3 size={12} />
                    {t('playCount', { count: track.playCount })}
                  </span>
                )}
              </div>

              {/* Action Buttons — Cockpit-Style mit clipPath-Akzent */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={handlePlay}
                  style={{
                    background: isSoundcloud ? '#F57C00' : '#3FCF4A',
                    color: '#0A0B0C',
                    border: 'none',
                    padding: '12px 22px',
                    minHeight: 48,
                    fontFamily: 'var(--font-display)',
                    fontWeight: 900,
                    fontSize: 13,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: isSoundcloud
                      ? '0 0 20px rgba(245,124,0,0.5), inset 0 0 0 2px #0A0B0C'
                      : '0 0 20px rgba(63,207,74,0.5), inset 0 0 0 2px #0A0B0C',
                    clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
                  }}
                >
                  {showPause ? <Pause size={18} /> : <Play size={18} />}
                  {showPause ? t('pause') : t('playTrack')}
                </button>

                <button
                  onClick={handleShare}
                  title={t('shareTitle')}
                  style={{
                    background: 'transparent',
                    color: '#3FCF4A',
                    border: '1px solid rgba(63,207,74,0.4)',
                    padding: '12px 18px',
                    minHeight: 48,
                    fontFamily: 'var(--font-display)',
                    fontWeight: 900,
                    fontSize: 12,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Share2 size={16} />
                  {t('share')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SoundCloud Embed (nur für SC-Tracks) */}
        {isSoundcloud && track.soundcloudEmbedUrl && (
          <div
            className="kbk-obsidian framed"
            style={{ padding: 16, marginBottom: 24 }}
          >
            <SoundCloudEmbed
              embedUrl={track.soundcloudEmbedUrl}
              trackTitle={track.title}
              soundcloudUrl={track.soundcloudUrl || undefined}
            />
          </div>
        )}

        {/* Beschreibung */}
        {track.description && (
          <div style={{ marginBottom: 24 }}>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: '#3FCF4A',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                margin: '0 0 12px',
              }}
            >
              {t('eyebrowAbout')}
            </p>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 900,
                color: '#fff',
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
                margin: '0 0 14px',
              }}
            >
              {t('aboutHeading')}
            </h2>
            <div
              className="kbk-obsidian framed"
              style={{ padding: 24 }}
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  lineHeight: 1.65,
                  color: 'rgba(255,255,255,0.85)',
                  whiteSpace: 'pre-line',
                }}
              >
                {track.description}
              </p>
            </div>
          </div>
        )}

        {/* Verwandte Tracks */}
        {relatedTracks.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: '#3FCF4A',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                margin: '0 0 12px',
              }}
            >
              {t('eyebrowRelated')}
            </p>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 900,
                color: '#fff',
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
                margin: '0 0 16px',
              }}
            >
              {t('relatedHeading')}
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 14,
              }}
            >
              {relatedTracks.map((related) => (
                <Link
                  key={related.id}
                  href={`/tracks/${related.slug}`}
                  className="kbk-obsidian framed"
                  style={{
                    padding: 14,
                    textDecoration: 'none',
                    display: 'block',
                    color: '#fff',
                  }}
                >
                  <div
                    style={{
                      aspectRatio: '1 / 1',
                      position: 'relative',
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      marginBottom: 12,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {related.trackType === 'SOUNDCLOUD' && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          padding: '2px 6px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          background: 'rgba(245,124,0,0.85)',
                          color: '#fff',
                          zIndex: 10,
                        }}
                      >
                        SC
                      </span>
                    )}
                    <SafeImg
                      src={related.coverUrl}
                      alt={related.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                      fallback={<Music2 size={32} color="rgba(255,255,255,0.2)" />}
                    />
                  </div>
                  <h3
                    style={{
                      margin: '0 0 6px',
                      fontFamily: 'var(--font-display)',
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#fff',
                      letterSpacing: '-0.005em',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {related.title}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.6)',
                      letterSpacing: '0.05em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {related.artistName}
                    </span>
                    {related.genre && (
                      <>
                        <span style={{ color: 'rgba(255,255,255,0.25)' }}>&bull;</span>
                        <span style={{ color: 'rgba(245,208,46,0.7)' }}>{related.genre}</span>
                      </>
                    )}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Footer-Link */}
        <div
          style={{
            textAlign: 'center',
            paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Link
            href="/library"
            style={{
              color: '#3FCF4A',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            {t('openFullPlayer')} &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
