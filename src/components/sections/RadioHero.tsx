'use client'

/**
 * RadioHero — "Was läuft gerade?" Hero-Section
 *
 * Zeigt den aktuellen Radio-Track, einen CSS-Equalizer,
 * "Start Listening" Button, und einen prominenten Mute-Button wenn Musik läuft.
 * Keine Logos, keine Registration-CTAs, kein "Was ist KBK".
 */

import { useState, useEffect, useRef } from 'react'
import { Play, Radio, Loader2, Volume2, VolumeX, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { usePlayer } from '@/components/providers/PlayerProvider'
import { cn } from '@/lib/utils'
import AnimatedLogoMark from '@/components/layout/AnimatedLogoMark'

interface NowPlayingData {
  track: { title: string; artist: string } | null
  slot: { label: string } | null
  eventType?: string
}

export default function RadioHero() {
  const t = useTranslations('landing')
  const { enterRadioMode, radioMode, radioLoading, audio } = usePlayer()
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null)
  const [loading, setLoading] = useState(true)
  const prevVolumeRef = useRef(0.7)

  // Aktuellen Track vom Server holen
  useEffect(() => {
    fetch('/api/radio/now-playing')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setNowPlaying(json.data)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Track-Info live updaten wenn Radio läuft
  useEffect(() => {
    if (!radioMode || !audio.currentTrack) return
    setNowPlaying((prev) => ({
      track: {
        title: audio.currentTrack!.title,
        artist: audio.currentTrack!.artist,
      },
      slot: prev?.slot ?? null,
      eventType: prev?.eventType,
    }))
  }, [radioMode, audio.currentTrack])

  const isPlaying = radioMode && audio.isPlaying
  const isMuted = audio.volume === 0
  const hasActiveSlot = nowPlaying?.track || nowPlaying?.eventType

  const handleStartListening = async () => {
    await enterRadioMode()
  }

  const handleToggleMute = () => {
    if (isMuted) {
      audio.setVolume(prevVolumeRef.current || 0.7)
    } else {
      prevVolumeRef.current = audio.volume
      audio.setVolume(0)
    }
  }

  return (
    <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
      {/* Subtiler Hintergrund-Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-kbk-black via-kbk-dark-900 to-kbk-black" />
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle at 50% 50%, var(--rasta-green) 0%, transparent 50%)',
      }} />

      {/* Radio-Wellen-Effekt — konzentrische Kreise, die nach außen pulsieren.
          Gestaffelt mit Delays für natuerlichen Wave-Look. Opacity bleibt niedrig,
          damit der Content im Vordergrund lesbar bleibt. Farben aus dem Rasta-Theme. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <div className="relative w-[60vmin] h-[60vmin] max-w-[600px] max-h-[600px]">
          <div
            className="absolute inset-0 rounded-full border border-rasta-green/40 animate-radio-wave"
            style={{ animationDelay: '0s' }}
          />
          <div
            className="absolute inset-0 rounded-full border border-rasta-yellow/30 animate-radio-wave"
            style={{ animationDelay: '1.3s' }}
          />
          <div
            className="absolute inset-0 rounded-full border border-rasta-red/30 animate-radio-wave"
            style={{ animationDelay: '2.6s' }}
          />
        </div>
      </div>

      <div className="relative z-10 text-center px-4 max-w-2xl mx-auto space-y-8">
        {/* Animiertes Logo — Wolf mit leuchtenden Augen + Speaker-Ripples */}
        <div className="flex items-center justify-center">
          <AnimatedLogoMark
            size={140}
            ripples={isPlaying && !isMuted}
            eyes={Boolean(hasActiveSlot) || isPlaying}
          />
        </div>

        {/* "Now Playing" oder Willkommen */}
        {loading ? (
          <div className="space-y-3">
            <div className="h-4 w-24 mx-auto bg-elevated rounded animate-pulse" />
            <div className="h-8 w-64 mx-auto bg-elevated rounded animate-pulse" />
          </div>
        ) : hasActiveSlot ? (
          <div className="space-y-3">
            <p className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.25em] text-rasta-green uppercase">
              {isPlaying && (
                <span className="inline-block w-2 h-2 rounded-full bg-rasta-green animate-live-pulse" aria-hidden="true" />
              )}
              <span className="opacity-60">/00/</span>
              <span>{isPlaying ? t('radioNowPlaying') : t('radioOnAir')}</span>
            </p>
            {nowPlaying?.track ? (
              <>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight">
                  {nowPlaying.track.title}
                </h1>
                <p className="text-lg text-secondary font-mono tracking-wide">
                  {nowPlaying.track.artist}
                </p>
              </>
            ) : nowPlaying?.eventType ? (
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
                <span className="px-2 py-1 rounded bg-rasta-red/20 text-rasta-red text-sm font-bold mr-2 font-mono tracking-widest">LIVE</span>
                {nowPlaying.slot?.label}
              </h1>
            ) : null}
            {nowPlaying?.slot && !isPlaying && (
              <p className="text-sm text-muted font-mono">
                {nowPlaying.slot.label}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-mono text-[11px] tracking-[0.25em] text-muted uppercase">
              <span className="opacity-60">/00/</span> KBK · RADIO
            </p>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl text-rasta-green tracking-widest animate-glitch-subtle leading-none">
              {t('radioHeadingLine1')}<br />{t('radioHeadingLine2')}
            </h1>
            <p className="text-base text-secondary font-mono tracking-wide uppercase">
              Raggatek · Hardtek · Phonk
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="space-y-4">
          {isPlaying ? (
            <div className="flex flex-col items-center gap-4">
              {/* Prominenter Mute-Button */}
              <button
                onClick={handleToggleMute}
                className={cn(
                  'w-20 h-20 rounded-full flex items-center justify-center transition-all hover:scale-105 cursor-pointer shadow-lg',
                  isMuted
                    ? 'bg-muted/20 text-muted hover:bg-muted/30 shadow-none'
                    : 'bg-rasta-green/15 text-rasta-green hover:bg-rasta-green/25 shadow-rasta-green/10'
                )}
              >
                {isMuted ? (
                  <VolumeX size={32} />
                ) : (
                  <Volume2 size={32} />
                )}
              </button>
              <div className="flex items-center gap-2 text-rasta-green">
                <Radio size={16} className="animate-pulse" />
                <span className="text-sm font-medium">
                  {isMuted ? `KBK Radio — ${t('radioMutedSuffix')}` : 'KBK Radio'}
                </span>
              </div>
            </div>
          ) : (
            <button
              onClick={handleStartListening}
              disabled={radioLoading}
              className="inline-flex items-center gap-3 px-8 py-4 bg-rasta-green text-white rounded-full text-lg font-semibold hover:bg-rasta-green-light transition-all hover:scale-105 disabled:opacity-50 cursor-pointer shadow-lg shadow-rasta-green/20"
            >
              {radioLoading ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <Play size={22} fill="currentColor" className="ml-0.5" />
              )}
              {t('radioStartListening')}
            </button>
          )}

          <p className="text-xs text-muted">
            <Link href="/library" className="hover:text-foreground transition-colors">
              {t('radioBrowseCollection')} →
            </Link>
          </p>
        </div>
      </div>

      {/* Scroll-Hint — deutet an, dass unterhalb des Heros mehr Content wartet.
          Rein dekorativ, bei prefers-reduced-motion wird die bounce-Animation unterdrueckt. */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none" aria-hidden="true">
        <ChevronDown
          size={22}
          className="text-muted/50 animate-bounce"
        />
      </div>

    </section>
  )
}
