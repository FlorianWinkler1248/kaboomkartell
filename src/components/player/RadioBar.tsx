'use client'

/**
 * RadioBar — Visueller Radio-Player als fixierte Bottom-Bar
 *
 * Layout (Desktop):
 *   [Progress-Bar (2px top)]
 *   [Current Cover] [Slot + Title + Artist + Time]  [Next Cover] [Next: Title]  [Mute]
 *
 * Mobile: Next-Track wird ausgeblendet (sm:flex), Cover-Thumbs bleiben.
 * Equalizer-Canvas bleibt als Hintergrund-Visualisierung.
 */

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Volume2, VolumeX, Play, Radio, Loader2, Music2 } from 'lucide-react'
import { usePlayer } from '@/components/providers/PlayerProvider'
import AudioVisualizer from '@/components/player/AudioVisualizer'
import { cn, formatTime } from '@/lib/utils'
import { SafeImg } from '@/components/ui/SafeImg'

export default function RadioBar() {
  const t = useTranslations('playerUi')
  const pathname = usePathname()
  const {
    audio,
    radioMode,
    radioSlot,
    radioNextTrack,
    radioLoading,
    isLiveEvent,
    enterRadioMode,
    analyser,
  } = usePlayer()

  const prevVolumeRef = useRef(0.7)

  // Im Admin-Bereich nicht anzeigen
  if (pathname.startsWith('/admin')) return null

  const isPlaying = radioMode && audio.isPlaying
  const isMuted = audio.volume === 0
  const hasTrack = audio.currentTrack !== null

  // Progress in Prozent (0-100) — Duration aus audio-Element (echte MP3-Duration)
  const progressPercent =
    audio.duration > 0 ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0

  const handleToggleMute = () => {
    if (isMuted) {
      audio.setVolume(prevVolumeRef.current || 0.7)
    } else {
      prevVolumeRef.current = audio.volume
      audio.setVolume(0)
    }
  }

  const handleTuneIn = async () => {
    await enterRadioMode()
  }

  const currentCover = audio.currentTrack?.coverUrl
  const nextCover = radioNextTrack?.coverUrl

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div
        className="relative bg-kbk-black/90 border-t border-border/30 pb-[env(safe-area-inset-bottom)]"
        style={{ height: '96px' }}
      >
        {/* Progress-Bar am oberen Rand — nur sichtbar im Radio-Modus mit Track */}
        {radioMode && hasTrack && audio.duration > 0 && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rasta-green via-rasta-yellow to-rasta-red transition-[width] duration-1000 ease-linear"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Equalizer-Canvas — füllt die gesamte Bar */}
        <div className="absolute inset-0 overflow-hidden">
          <AudioVisualizer
            getFrequencyData={analyser.getFrequencyData}
            isActive={isPlaying && !isMuted}
            barCount={48}
          />
        </div>

        {/* Overlay-Content über dem Equalizer */}
        <div className="relative z-10 h-full max-w-7xl mx-auto px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4">
          {/* === Current Track (links) === */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {radioMode && hasTrack ? (
              // Click auf Cover + Track-Info führt zur Full-Screen-Player-Page
              <Link
                href="/radio"
                className="flex items-center gap-3 min-w-0 flex-1 group"
                aria-label={t('openFullScreenPlayer')}
              >
                {/* Cover-Thumbnail aktueller Track */}
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-kbk-dark-800 shrink-0 border border-border/50 shadow-lg group-hover:border-rasta-green/60 transition-colors">
                  <SafeImg
                    src={currentCover}
                    alt={audio.currentTrack?.title || ''}
                    className="w-full h-full object-cover"
                    fallback={
                      <div className="w-full h-full flex items-center justify-center">
                        <Music2 size={20} className="text-muted" />
                      </div>
                    }
                  />
                </div>

                {/* Track-Info */}
                <div className="min-w-0 flex-1 bg-kbk-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 group-hover:bg-kbk-black/80 transition-colors">
                  {radioSlot && (
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-rasta-green truncate flex items-center gap-1.5">
                      {isLiveEvent && (
                        <span className="px-1 py-0.5 rounded bg-red-500/30 text-red-400 text-[9px]">
                          LIVE
                        </span>
                      )}
                      {radioSlot.label}
                    </p>
                  )}
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-rasta-green transition-colors">
                    {audio.currentTrack?.title}
                  </p>
                  <p className="text-[11px] text-muted truncate flex items-center gap-1.5">
                    <span className="truncate">{audio.currentTrack?.artist}</span>
                    {audio.duration > 0 && (
                      <>
                        <span className="text-muted/50">·</span>
                        <span className="tabular-nums text-muted/80 shrink-0">
                          {formatTime(audio.currentTime)} / {formatTime(audio.duration)}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </Link>
            ) : radioMode ? (
              <div className="bg-kbk-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5">
                <div className="flex items-center gap-2 text-rasta-green">
                  <Radio size={14} className="animate-pulse" />
                  <span className="text-xs font-medium">KBK Radio</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* === Next Track (Mitte — nur auf Desktop sichtbar) === */}
          {radioMode && radioNextTrack && (
            <div className="hidden md:flex items-center gap-2 min-w-0 max-w-xs bg-kbk-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-violet-400/10">
              <div className="w-9 h-9 rounded overflow-hidden bg-kbk-dark-800 shrink-0 border border-border/50">
                <SafeImg
                  src={nextCover}
                  alt={radioNextTrack.title}
                  className="w-full h-full object-cover opacity-70"
                  fallback={
                    <div className="w-full h-full flex items-center justify-center">
                      <Music2 size={14} className="text-muted" />
                    </div>
                  }
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase tracking-wider text-violet-400 font-semibold">
                  {t('upNext')}
                </p>
                <p className="text-xs font-medium text-foreground/80 truncate">
                  {radioNextTrack.title}
                </p>
                <p className="text-[10px] text-muted truncate">{radioNextTrack.artist}</p>
              </div>
            </div>
          )}

          {/* === Controls (rechts) === */}
          <div className="shrink-0">
            {radioMode ? (
              <button
                onClick={handleToggleMute}
                className={cn(
                  'w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg',
                  isMuted
                    ? 'bg-kbk-black/70 text-muted hover:text-foreground'
                    : 'bg-kbk-black/70 text-rasta-green hover:bg-kbk-black/90 hover:scale-105'
                )}
                title={isMuted ? t('unmute') : t('mute')}
                aria-label={isMuted ? t('unmute') : t('mute')}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            ) : (
              <button
                onClick={handleTuneIn}
                disabled={radioLoading}
                className="flex items-center gap-2 px-4 py-2 bg-rasta-green/90 text-white rounded-full text-sm font-medium hover:bg-rasta-green transition-all cursor-pointer disabled:opacity-50 shadow-lg hover:scale-105"
              >
                {radioLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Play size={16} fill="currentColor" className="ml-0.5" />
                )}
                {t('tuneIn')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
