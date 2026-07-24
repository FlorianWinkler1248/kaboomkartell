'use client';

/**
 * Playlist-Detail Client-Component (Cockpit-Style)
 *
 * Zeigt Playlist-Header (Slug + H1 + Mono-Subline), Cover und Track-Liste
 * mit Play-Buttons. „Play All" lädt alle Tracks in den globalen
 * PlayerProvider. Visuell auf den KBK-Cockpit-Look migriert (Inline-Styles,
 * Vulkanglas-Card, Hex-Farben). Funktional unverändert.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Play,
  Music2,
  Clock,
  RotateCw,
  ArrowLeft,
  Headphones,
} from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { formatArtistDisplay } from '@/lib/track-display';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { SOUNDCLOUD_ORANGE } from '@/lib/constants';
import type { PlayerTrack } from '@/types';
import { SafeImg } from '@/components/ui/SafeImg';
import SoundCloudEmbed from '@/components/player/SoundCloudEmbed';
import AuraLikeButton from '@/components/kbk/AuraLikeButton';

// Eigenes Track-Interface (trackType als string, da aus DB)
interface PlaylistTrackItem {
  id: string;
  title: string;
  slug: string;
  trackType: string;
  duration: number;
  coverUrl: string | null;
  genre: string | null;
  bpm: number | null;
  playCount: number;
  aiDisclosure: string | null;
  aiSource: string | null;
  auraCount: number;
  susCount: number;
  totalVotes: number;
  susPercentage: number;
  artist: { id: string; username: string; displayName: string | null };
  featuringArtist: { id: string; username: string; displayName: string | null } | null;
  // ADR-041: externes Künstler-Profil — formatArtistDisplay priorisiert den Namen
  artistProfile?: { slug: string; name: string } | null;
  streamUrl: string;
  soundcloudUrl?: string | null;
  soundcloudEmbedUrl?: string | null;
  soundcloudArtwork?: string | null;
}

interface PlaylistData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  type: string;
  typeLabel: string;
  genre: string | null;
  isFeatured: boolean;
  trackCount: number;
  tracks: PlaylistTrackItem[];
}

// Track von API-Format in PlayerTrack konvertieren (v2.8 Featuring-aware,
// nutzt zentralen formatArtistDisplay-Helper für die "feat."-Schreibweise)
function toPlayerTrack(track: PlaylistTrackItem): PlayerTrack {
  return {
    id: track.id,
    title: track.title,
    artist: formatArtistDisplay(track),
    duration: track.duration,
    url: track.trackType === 'SOUNDCLOUD'
      ? (track.soundcloudUrl || '')
      : track.streamUrl,
    coverUrl: track.coverUrl || undefined,
    isLocal: false,
    isSoundcloud: track.trackType === 'SOUNDCLOUD',
    soundcloudEmbedUrl: track.soundcloudEmbedUrl || undefined,
  };
}

// Type-Badge Farbschema (Inline-Hex statt Tailwind-Tokens)
function typeBadgeColors(type: string): { bg: string; fg: string } {
  if (type === 'showcase') return { bg: 'rgba(255,85,0,0.18)', fg: SOUNDCLOUD_ORANGE };
  if (type === 'manual') return { bg: 'rgba(96,165,250,0.18)', fg: '#60A5FA' };
  if (type.includes('weekly')) return { bg: 'rgba(63,207,74,0.18)', fg: '#3FCF4A' };
  if (type.includes('monthly')) return { bg: 'rgba(168,85,247,0.18)', fg: '#A855F7' };
  return { bg: 'rgba(245,208,46,0.18)', fg: '#F5D02E' };
}

export default function PlaylistDetailClient({ playlist }: { playlist: PlaylistData }) {
  const t = useTranslations('pagesUi');
  const router = useRouter();
  const { playTracks, audio, radioMode, exitRadioMode } = usePlayer();
  const currentTrack = audio.currentTrack;
  const isPlaying = audio.isPlaying;

  // SC-Zeilen sind expandierbar (ADR-041): Tap klappt das SoundCloud-Widget
  // unter der Zeile auf (autoPlay, User-Geste liegt vor). Nur EIN Embed offen.
  const [expandedScId, setExpandedScId] = useState<string | null>(null);

  const handleToggleSc = (track: PlaylistTrackItem) => {
    if (expandedScId === track.id) {
      setExpandedScId(null);
      return;
    }
    // Eigenes Audio stoppen, bevor das SC-Widget übernimmt (Muster playTrackAtIndex).
    if (radioMode) exitRadioMode();
    if (audio.isPlaying) audio.pause();
    setExpandedScId(track.id);
  };

  // Gesamtdauer berechnen (nur lokale Tracks, SC-Dauer ist 0)
  const totalDuration = playlist.tracks.reduce((sum, t) => sum + t.duration, 0);

  // Nur lokale Tracks sind abspielbar (SoundCloud-Embeds funktionieren nicht in Playlists)
  const playableTracks = playlist.tracks.filter((t) => t.trackType !== 'SOUNDCLOUD');

  // Alle abspielbaren Tracks abspielen. playTracks (ADR-041) statt
  // setTracks+playTrackAtIndex — der Zwei-Schritt las im selben Tick noch die
  // alte Playlist (Stale-Closure) und spielte beim Erst-Klick nichts.
  const handlePlayAll = () => {
    if (playableTracks.length === 0) return;
    playTracks(playableTracks.map(toPlayerTrack), 0);
  };

  // Einzelnen Track abspielen (nur lokale Tracks, SC wird ignoriert)
  const handlePlayTrack = (track: PlaylistTrackItem) => {
    if (track.trackType === 'SOUNDCLOUD') return;
    const idx = playableTracks.findIndex((t) => t.id === track.id);
    playTracks(playableTracks.map(toPlayerTrack), idx >= 0 ? idx : 0);
  };

  const badgeColors = typeBadgeColors(playlist.type);

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
        {/* Zurück-Link (Mono, dezent) */}
        <button
          onClick={() => router.back()}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: 0,
            marginBottom: 18,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} />
          {t('back')}
        </button>

        {/* Header — Slug + H1 + Mono-Subline */}
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#3FCF4A',
            letterSpacing: '0.2em',
            margin: '0 0 10px',
            textTransform: 'uppercase',
          }}
        >
          /P/ {t('playlistSlugLabel')}
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
          <span style={{ color: '#3FCF4A', textShadow: '0 0 24px #3FCF4A' }}>
            {playlist.name}
          </span>
        </h1>
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
          {t('trackCount', { count: playlist.trackCount })}
          {totalDuration > 0 ? `  ·  ${formatTime(totalDuration)}` : ''}
          {playlist.genre ? `  ·  ${playlist.genre}` : ''}
        </p>

        {/* Hero-Card: Cover + Info + Play-All */}
        <div
          className="kbk-obsidian framed"
          style={{
            padding: 28,
            marginBottom: 18,
            display: 'flex',
            flexDirection: 'row',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          {/* Cover */}
          <div
            style={{
              width: 192,
              height: 192,
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
              src={playlist.coverUrl}
              alt={playlist.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fallback={<Music2 size={48} color="rgba(255,255,255,0.25)" />}
            />
          </div>

          {/* Info */}
          <div
            style={{
              flex: 1,
              minWidth: 240,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            {/* Type-Badge */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                width: 'fit-content',
                padding: '4px 10px',
                background: badgeColors.bg,
                color: badgeColors.fg,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                border: `1px solid ${badgeColors.fg}33`,
              }}
            >
              {playlist.type !== 'manual' && <RotateCw size={9} />}
              {playlist.typeLabel}
            </span>

            {playlist.description && (
              <p
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.85)',
                  letterSpacing: '0.02em',
                  lineHeight: 1.5,
                }}
              >
                {playlist.description}
              </p>
            )}

            {/* Mono-Stats (Tracks · Duration · Genre) */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 14,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'rgba(255,255,255,0.6)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              <span>{t('trackCount', { count: playlist.trackCount })}</span>
              {totalDuration > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} />
                  {formatTime(totalDuration)}
                </span>
              )}
              {playlist.genre && <span>{playlist.genre}</span>}
            </div>

            {/* Play-All-Button (nur wenn abspielbare Tracks vorhanden) */}
            {playableTracks.length > 0 && (
              <button
                onClick={handlePlayAll}
                style={{
                  marginTop: 6,
                  background: '#3FCF4A',
                  color: '#0A0B0C',
                  border: 'none',
                  padding: '12px 22px',
                  minHeight: 44,
                  width: 'fit-content',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: 12,
                  letterSpacing: '0.15em',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 0 20px rgba(63,207,74,0.5), inset 0 0 0 2px #0A0B0C',
                  clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
                  textTransform: 'uppercase',
                }}
              >
                <Play size={16} fill="currentColor" />
                {t('playAll', { count: playableTracks.length })}
              </button>
            )}
          </div>
        </div>

        {/* Track-Liste (Vulkanglas-Card) */}
        {playlist.trackCount === 0 ? (
          <div
            className="kbk-obsidian framed"
            style={{
              padding: 40,
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'rgba(255,255,255,0.6)',
              letterSpacing: '0.05em',
            }}
          >
            <Music2
              size={40}
              color="rgba(255,255,255,0.25)"
              style={{ margin: '0 auto 12px', display: 'block' }}
            />
            <p style={{ margin: 0 }}>{t('playlistEmpty')}</p>
          </div>
        ) : (
          <div
            className="kbk-obsidian framed"
            style={{
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {playlist.tracks.map((track, index) => {
              const isCurrentTrack = currentTrack?.id === track.id;
              const isSC = track.trackType === 'SOUNDCLOUD';
              const isExpandedSc = isSC && expandedScId === track.id;

              // Row-Background nach Zustand (Hover-Effekt via onMouseEnter/Leave Inline)
              const rowBg = isExpandedSc
                ? 'rgba(255,85,0,0.08)'
                : isCurrentTrack
                ? 'rgba(63,207,74,0.10)'
                : 'transparent';
              const rowBorder = isExpandedSc
                ? '1px solid rgba(255,85,0,0.35)'
                : isCurrentTrack
                ? '1px solid rgba(63,207,74,0.35)'
                : '1px solid transparent';

              return (
                <div key={track.id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    background: rowBg,
                    border: rowBorder,
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrentTrack && !isExpandedSc) {
                      (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrentTrack && !isExpandedSc) {
                      (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    }
                  }}
                >
                  {/* Nummer / Play-Button — SC-Tracks togglen das Embed (ADR-041) */}
                  <button
                    onClick={() => (isSC ? handleToggleSc(track) : handlePlayTrack(track))}
                    title={isSC ? t('soundcloudPlayHint') : undefined}
                    aria-expanded={isSC ? isExpandedSc : undefined}
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
                      color: isCurrentTrack ? '#3FCF4A' : 'rgba(255,255,255,0.55)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                    }}
                  >
                    {isExpandedSc ? (
                      <Headphones
                        size={16}
                        color={SOUNDCLOUD_ORANGE}
                        style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
                      />
                    ) : isCurrentTrack && isPlaying ? (
                      <Headphones
                        size={16}
                        color="#3FCF4A"
                        style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
                      />
                    ) : isSC ? (
                      <Play size={14} color={SOUNDCLOUD_ORANGE} />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </button>

                  {/* Cover */}
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
                      src={track.coverUrl || track.soundcloudArtwork}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      fallback={<Music2 size={14} color="rgba(255,255,255,0.3)" />}
                    />
                  </div>

                  {/* Track-Info — Title + Artist (formatArtistDisplay) */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Link
                      href={`/tracks/${track.slug}`}
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                        color: isCurrentTrack ? '#3FCF4A' : '#fff',
                        textDecoration: 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {track.title}
                    </Link>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.55)',
                        letterSpacing: '0.05em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatArtistDisplay(track)}
                      {track.genre ? ` — ${track.genre}` : ''}
                    </p>
                  </div>

                  {/* BPM + Dauer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      flexShrink: 0,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.5)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {isSC && (
                      <span
                        style={{
                          padding: '2px 6px',
                          background: 'rgba(255,85,0,0.18)',
                          color: SOUNDCLOUD_ORANGE,
                          fontSize: 9,
                          letterSpacing: '0.15em',
                          border: '1px solid rgba(255,85,0,0.35)',
                        }}
                      >
                        SC
                      </span>
                    )}
                    {track.bpm && <span>{track.bpm} BPM</span>}
                    <span style={{ width: 48, textAlign: 'right' }}>
                      {isSC ? '—' : formatTime(track.duration)}
                    </span>
                  </div>

                  {/* Aura+-Like (ADR-041) — speist My Playlist */}
                  <AuraLikeButton
                    track={{
                      id: track.id,
                      title: track.title,
                      slug: track.slug,
                      trackType: track.trackType,
                      duration: track.duration,
                      coverUrl: track.coverUrl || track.soundcloudArtwork,
                      genre: track.genre,
                      artistLabel: formatArtistDisplay(track),
                      soundcloudUrl: track.soundcloudUrl,
                      soundcloudEmbedUrl: track.soundcloudEmbedUrl,
                    }}
                  />

                  {/* Play-Count (ab Tablet sichtbar) */}
                  <div
                    className="kbk-playlist-playcount"
                    style={{
                      display: 'none',
                      alignItems: 'center',
                      gap: 4,
                      flexShrink: 0,
                      width: 64,
                      justifyContent: 'flex-end',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.5)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    <Headphones size={11} />
                    {track.playCount}
                  </div>
                </div>

                {/* Expandiertes SC-Widget unter der Zeile (autoPlay — User-Geste liegt vor) */}
                {isExpandedSc && track.soundcloudEmbedUrl && (
                  <div style={{ padding: '6px 14px 12px' }}>
                    <SoundCloudEmbed
                      embedUrl={track.soundcloudEmbedUrl}
                      trackTitle={track.title}
                      soundcloudUrl={track.soundcloudUrl ?? undefined}
                      autoPlay
                    />
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tablet+ — Play-Count-Spalte einblenden via Inline-Style-Tag.
            Tailwind-Class "sm:flex" würde es auch tun, aber wir bleiben hier
            cockpit-rein und nutzen einen kleinen Style-Block. */}
        <style>{`
          @media (min-width: 640px) {
            .kbk-playlist-playcount { display: flex !important; }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    </section>
  );
}
