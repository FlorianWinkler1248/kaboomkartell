'use client'

/**
 * FullScreenPlayer — Immersiver Full-Screen-Player für /radio
 *
 * Layout:
 *   [← Back]                                                             [Radio Icon]
 *
 *          [Blurred Cover als Hintergrund, über Viewport]
 *
 *                     [Slot-Badge]
 *                     [400x400 Cover, beat-pulse wenn playing]
 *                     [Titel 4xl]
 *                     [Artist → /profile/<slug>]  [Genre-Chip]
 *
 *                     [Seek-Bar   Time / Time]
 *                     [Mute]  [Play/Pause groß]
 *
 *          [Upcoming Queue — next Track + nachfolgende, horizontal scroll]
 *
 *          [About this Pool — Name, Duration, Slot endet um XX:XX]
 *
 * Nutzt `usePlayer()` für gesamten State. Keine eigenen Fetches.
 * Kompensiert die RadioBar-Hoehe (96px) durch bottom-padding.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Radio,
  Clock,
  Music2,
  SkipForward,
} from 'lucide-react'
import { usePlayer } from '@/components/providers/PlayerProvider'
import { cn, formatTime, slugify } from '@/lib/utils'
import { SafeImg } from '@/components/ui/SafeImg'
import { TwitchEmbed } from '@/components/twitch/TwitchEmbed'
import { extractTwitchChannelFromUrl } from '@/lib/twitch-url'

// Aus dem PlayerProvider: radioSlot hat keinen slotEndsAt — der Wert kommt
// zusätzlich vom API-Endpunkt, den wir lokal in einem leichten Fetch holen,
// damit wir "Slot endet um ..." sauber anzeigen können. Kein Context-Umbau.
interface SlotMeta {
  slotEndsAt: string | null
  poolName: string | null
  poolDescription: string | null
  poolDurationSeconds: number | null
}

export default function FullScreenPlayer() {
  const t = useTranslations('playerUi')
  const {
    audio,
    radioMode,
    radioSlot,
    radioNextTrack,
    radioLoading,
    isLiveEvent,
    liveStreamUrl,
    enterRadioMode,
  } = usePlayer()

  // v2.31: Wenn der Slot ein Twitch-Live-Event ist, rendern wir den Twitch-
  // Player anstelle des Album-Covers. Audio kommt dann aus dem Embed.
  const liveTwitchChannel = isLiveEvent ? extractTwitchChannelFromUrl(liveStreamUrl) : null

  const prevVolumeRef = useRef(0.7)
  const [slotMeta, setSlotMeta] = useState<SlotMeta>({
    slotEndsAt: null,
    poolName: null,
    poolDescription: null,
    poolDurationSeconds: null,
  })

  const isPlaying = radioMode && audio.isPlaying
  const isMuted = audio.volume === 0
  const hasTrack = audio.currentTrack !== null
  const currentTrack = audio.currentTrack
  const currentCover = currentTrack?.coverUrl
  const nextCover = radioNextTrack?.coverUrl

  // Progress-Bar: exakte Position relativ zur echten MP3-Duration
  const progressPercent =
    audio.duration > 0 ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0

  // Artist-Link: /profile/<slug> — wir slugifizieren den Display-Namen, weil der
  // PlayerTrack nur `artist: string` kennt (keine Username-Referenz).
  const artistSlug = useMemo(
    () => (currentTrack?.artist ? slugify(currentTrack.artist) : ''),
    [currentTrack?.artist],
  )

  // Slot-Meta nur im Radio-Mode holen — leichter Fetch an now-playing, damit
  // wir slotEndsAt + Pool-Infos kriegen. Kein Poll nötig (RadioBar macht das
  // schon global); wir holen nur einmal + bei Slot-Wechsel.
  const radioSlotId = radioSlot?.id ?? null
  useEffect(() => {
    if (!radioMode || !radioSlotId) {
      setSlotMeta({
        slotEndsAt: null,
        poolName: null,
        poolDescription: null,
        poolDurationSeconds: null,
      })
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/radio/now-playing')
        const json = await res.json()
        if (cancelled || !json.success || !json.data) return
        setSlotMeta({
          slotEndsAt: json.data.slotEndsAt ?? null,
          poolName: json.data.slot?.label ?? null,
          poolDescription: null,
          poolDurationSeconds: null,
        })
      } catch {
        // Silent fail — die RadioBar bleibt funktionsfaehig, wir zeigen
        // einfach die Pool-Meta-Section nicht.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [radioMode, radioSlotId])

  const handleTogglePlay = () => {
    if (!radioMode) {
      enterRadioMode()
      return
    }
    audio.togglePlay()
  }

  const handleToggleMute = () => {
    if (isMuted) {
      audio.setVolume(prevVolumeRef.current || 0.7)
    } else {
      prevVolumeRef.current = audio.volume
      audio.setVolume(0)
    }
  }

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!audio.duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    const percent = ((event.clientX - rect.left) / rect.width) * 100
    audio.seekPercent(Math.max(0, Math.min(100, percent)))
  }

  // "Slot endet um HH:MM" — lokal formatiert
  const slotEndsAtFormatted = useMemo(() => {
    if (!slotMeta.slotEndsAt) return null
    try {
      const date = new Date(slotMeta.slotEndsAt)
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return null
    }
  }, [slotMeta.slotEndsAt])

  return (
    <div className="relative min-h-screen bg-kbk-black overflow-hidden">
      {/* === Blurred Cover als Hintergrund === */}
      {currentCover && (
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${currentCover})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(40px) brightness(0.35) saturate(1.2)',
            transform: 'scale(1.2)',
          }}
        />
      )}
      {/* Dunkler Farbverlauf über dem Blur — hält Text lesbar */}
      <div
        className="fixed inset-0 z-0 bg-gradient-to-b from-kbk-black/80 via-kbk-black/60 to-kbk-black pointer-events-none"
        aria-hidden="true"
      />

      {/* === Obere Leiste: Back + Radio-Badge === */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4 sm:py-6">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-muted hover:text-foreground transition-colors hover:bg-kbk-black/60 backdrop-blur-sm"
          aria-label={t('goBack')}
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">{t('back')}</span>
        </Link>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-kbk-black/60 backdrop-blur-sm border border-border/40">
          <Radio
            size={14}
            className={cn(
              'text-rasta-green',
              isPlaying ? 'animate-pulse' : 'opacity-60',
            )}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-rasta-green">
            KBK Radio
          </span>
          {isLiveEvent && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-red-500/30 text-red-400 text-[10px] font-bold">
              LIVE
            </span>
          )}
        </div>
      </header>

      {/* === Hauptinhalt === */}
      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pb-32">
        {/* Wenn noch kein Radio-Mode: CTA */}
        {!radioMode && !hasTrack ? (
          <div className="flex flex-col items-center justify-center text-center py-20 sm:py-32 space-y-6">
            <Radio size={80} className="text-rasta-green opacity-70" />
            <div>
              <h1 className="font-heading font-black text-4xl sm:text-5xl text-foreground">
                KBK Radio
              </h1>
              <p className="text-secondary mt-2 max-w-md">
                {t('tuneInPitch')}
              </p>
            </div>
            <button
              onClick={handleTogglePlay}
              disabled={radioLoading}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-rasta-green text-white font-semibold hover:bg-rasta-green-light transition-colors disabled:opacity-50 shadow-lg shadow-rasta-green/30"
            >
              <Play size={18} fill="currentColor" className="ml-0.5" />
              {t('tuneIn')}
            </button>
          </div>
        ) : (
          <>
            {/* === Player-Block === */}
            <section className="flex flex-col items-center pt-6 sm:pt-10">
              {/* Slot-Badge */}
              {radioSlot && (
                <div className="mb-6 flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-rasta-green/15 border border-rasta-green/30 text-rasta-green text-xs font-bold uppercase tracking-widest">
                    {radioSlot.label || t('onAir')}
                  </span>
                  {isLiveEvent && (
                    <span className="px-2 py-1 rounded-full bg-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-widest animate-pulse">
                      {t('live')}
                    </span>
                  )}
                </div>
              )}

              {/* v2.31: LIVESTREAM-Übernahme. Wenn der Slot ein Twitch-Live-Event ist,
                  rendern wir den Twitch-Player anstelle des Album-Covers. Audio kommt
                  dann direkt aus dem Embed, der Audio-Player ist im useRadioSync-Hook
                  bereits pausiert. */}
              {liveTwitchChannel ? (
                <div
                  className="kbk-livestream-pulse mb-8 rounded-2xl overflow-hidden"
                  style={{
                    width: '100%',
                    maxWidth: 960,
                    position: 'relative',
                    paddingBottom: 'min(56.25%, 540px)',
                    height: 0,
                    border: '2px solid rgba(145,70,255,0.85)',
                  }}
                >
                  <div style={{ position: 'absolute', inset: 0 }}>
                    <TwitchEmbed channel={liveTwitchChannel} autoplay muted={false} />
                  </div>
                </div>
              ) : (
              <div
                className={cn(
                  'relative rounded-2xl overflow-hidden bg-kbk-dark-800 shadow-2xl shadow-rasta-green/10 border border-border/30 mb-8',
                  'w-[240px] h-[240px] sm:w-[320px] sm:h-[320px] md:w-[400px] md:h-[400px]',
                  // Sanfter Beat-Pulse — Tailwind animate-pulse ist opacity-basiert,
                  // also Scale selbst definieren via inline-style-Keyframes.
                  isPlaying && 'animate-[beat_1s_ease-in-out_infinite]',
                )}
              >
                <SafeImg
                  src={currentCover}
                  alt={currentTrack?.title || t('nowPlayingCoverAlt')}
                  className="w-full h-full object-cover"
                  fallback={
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-kbk-dark-800 to-kbk-dark-900">
                      <Music2 size={80} className="text-muted opacity-50" />
                    </div>
                  }
                />

                {/* Glow-Ring um das Cover wenn playing */}
                {isPlaying && (
                  <div
                    className="absolute inset-0 rounded-2xl pointer-events-none ring-2 ring-rasta-green/30"
                    aria-hidden="true"
                  />
                )}
              </div>
              )}

              {/* Title */}
              <h1 className="font-heading font-black text-3xl sm:text-4xl md:text-5xl text-foreground text-center leading-tight max-w-3xl">
                {currentTrack?.title || (radioLoading ? t('loading') : t('silence'))}
              </h1>

              {/* Artist + Genre Chip */}
              <div className="mt-4 flex items-center gap-3 flex-wrap justify-center">
                {currentTrack?.artist && (
                  <Link
                    href={`/profile/${artistSlug}`}
                    className="text-lg sm:text-xl text-secondary hover:text-rasta-green transition-colors font-medium"
                  >
                    {currentTrack.artist}
                  </Link>
                )}
                {/* PlayerTrack hat kein genre — wir lassen die Chip-Logik als
                    Vorbereitung stehen, falls das später kommt. */}
              </div>

              {/* Seek-Bar + Time */}
              <div className="w-full max-w-2xl mt-10 px-4">
                <div
                  onClick={handleSeek}
                  className={cn(
                    'group relative h-2 rounded-full bg-kbk-dark-700 overflow-hidden',
                    audio.duration > 0
                      ? 'cursor-pointer hover:h-3 transition-all'
                      : 'opacity-50',
                  )}
                  role="slider"
                  aria-label={t('seek')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progressPercent)}
                >
                  <div
                    className="h-full bg-gradient-to-r from-rasta-green via-rasta-yellow to-rasta-red transition-[width] duration-1000 ease-linear"
                    style={{ width: `${progressPercent}%` }}
                  />
                  {/* Hover-Handle */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-rasta-yellow opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    style={{ left: `calc(${progressPercent}% - 6px)` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-muted tabular-nums">
                  <span>{formatTime(audio.currentTime)}</span>
                  <span>{formatTime(audio.duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="mt-8 flex items-center gap-4 sm:gap-6">
                <button
                  onClick={handleToggleMute}
                  className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center transition-all',
                    'bg-kbk-black/70 backdrop-blur-sm border border-border/40',
                    isMuted
                      ? 'text-muted hover:text-foreground'
                      : 'text-rasta-green hover:bg-kbk-black/90 hover:scale-105',
                  )}
                  title={isMuted ? t('unmute') : t('mute')}
                  aria-label={isMuted ? t('unmute') : t('mute')}
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>

                <button
                  onClick={handleTogglePlay}
                  disabled={radioLoading}
                  className={cn(
                    'w-20 h-20 rounded-full flex items-center justify-center transition-all',
                    'bg-rasta-green text-white shadow-xl shadow-rasta-green/40',
                    'hover:bg-rasta-green-light hover:scale-105 active:scale-95',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                  )}
                  title={isPlaying ? t('pause') : t('play')}
                  aria-label={isPlaying ? t('pause') : t('play')}
                >
                  {isPlaying ? (
                    <Pause size={32} fill="currentColor" />
                  ) : (
                    <Play size={32} fill="currentColor" className="ml-1" />
                  )}
                </button>

                {/* "Next" als Hinweis — Radio hat kein echtes Skip, aber wir zeigen
                    eine Preview des kommenden Tracks als Hover-Affordance. */}
                <div
                  className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center',
                    'bg-kbk-black/70 backdrop-blur-sm border border-border/40',
                    'text-muted/60',
                  )}
                  title={t('nextTrackLocked')}
                  aria-hidden="true"
                >
                  <SkipForward size={20} />
                </div>
              </div>
            </section>

            {/* === Queue / Upcoming === */}
            {radioNextTrack && (
              <section className="mt-16 sm:mt-20">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-violet-400" />
                  <h2 className="text-xs font-bold uppercase tracking-widest text-violet-400">
                    {t('upcoming')}
                  </h2>
                </div>

                {/* Horizontal scroll auf Mobile, Grid/Liste auf Desktop */}
                <div className="flex md:grid md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none">
                  <UpcomingCard
                    track={{
                      title: radioNextTrack.title,
                      artist: radioNextTrack.artist,
                      coverUrl: nextCover,
                    }}
                    position={1}
                  />
                  {/* Platzhalter für weitere Queue-Entries, falls die API
                      das in Zukunft liefert. Aktuell kennt useRadioSync nur
                      den next-Track — wir lassen die Card-Struktur offen. */}
                </div>
              </section>
            )}

            {/* === About this Pool === */}
            {radioSlot && (
              <section className="mt-16 sm:mt-20">
                <div className="rounded-2xl bg-surface/60 backdrop-blur-sm border border-border/40 p-6 sm:p-8">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-rasta-yellow mb-3">
                    {t('aboutThisPool')}
                  </h2>
                  <h3 className="font-heading font-black text-2xl text-foreground mb-2">
                    {slotMeta.poolName || radioSlot.label}
                  </h3>
                  {slotMeta.poolDescription && (
                    <p className="text-secondary text-sm leading-relaxed mb-4">
                      {slotMeta.poolDescription}
                    </p>
                  )}

                  <div className="mt-4 flex items-center gap-6 flex-wrap text-sm">
                    {slotMeta.poolDurationSeconds && slotMeta.poolDurationSeconds > 0 && (
                      <div className="flex items-center gap-2 text-muted">
                        <Music2 size={14} />
                        <span>{t('poolDuration', { duration: formatTime(slotMeta.poolDurationSeconds) })}</span>
                      </div>
                    )}
                    {slotEndsAtFormatted && (
                      <div className="flex items-center gap-2 text-muted">
                        <Clock size={14} />
                        <span className="text-rasta-yellow font-semibold tabular-nums">
                          {t('slotEndsAt', { time: slotEndsAtFormatted })}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted">
                      <Radio size={14} />
                      <span className="capitalize">{t('slotType', { type: radioSlot.type })}</span>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Inline-Keyframes für den Cover-Beat-Pulse — bewusst klein gehalten.
          Tailwind 4 erlaubt arbitrary animation-names via animate-[name].
          dangerouslySetInnerHTML vermeidet React's Whitespace-Trimming für
          `@keyframes` und hält die CSS scopefrei im Komponenten-File. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes beat {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.02); }
            }
          `,
        }}
      />
    </div>
  )
}

// === Upcoming-Card Sub-Komponente ===
// Rendert eine einzelne Queue-Entry. Bewusst klein gehalten — wenn die API
// mehr Queue-Items liefert, mappen wir einfach über UpcomingCard drüber.

interface UpcomingCardProps {
  track: {
    title: string
    artist: string
    coverUrl?: string
  }
  position: number
}

function UpcomingCard({ track, position }: UpcomingCardProps) {
  return (
    <div className="shrink-0 w-64 md:w-auto snap-start rounded-xl bg-surface/60 backdrop-blur-sm border border-border/30 p-3 flex gap-3 items-center hover:bg-surface/80 transition-colors">
      <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-kbk-dark-800 border border-border/40">
        <SafeImg
          src={track.coverUrl}
          alt={track.title}
          className="w-full h-full object-cover"
          fallback={
            <div className="w-full h-full flex items-center justify-center">
              <Music2 size={24} className="text-muted" />
            </div>
          }
        />
        <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-violet-400/90 text-[10px] font-bold text-kbk-black flex items-center justify-center tabular-nums">
          {position}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{track.title}</p>
        <p className="text-xs text-muted truncate">{track.artist}</p>
      </div>
    </div>
  )
}
