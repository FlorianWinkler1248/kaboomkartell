'use client';

/**
 * PlayerModeBar — das Player-Gesicht der unteren Leiste (05.08.2026).
 *
 * Sobald der Hörer einen einzelnen Titel oder eine Playlist auswählt, tritt er
 * aus der Hausparty heraus und bekommt einen klassischen MP3-Player: Transport,
 * Fortschritt zum Spulen, Shuffle, Wiederholung, Warteschlange — und einen
 * deutlichen Weg zurück ins Radio.
 *
 * Diese Leiste ÜBERSCHREIBT die Radio-Leiste vollständig (gleicher Platz,
 * anderes Gesicht). Die Trennung ist Absicht: im Radio gibt es bewusst keinen
 * Transport, im Player bewusst keine Channel-Tabs.
 *
 * Aufbau:
 *  [Fortschritts-Streifen über die volle Breite]
 *  [Cover] [Titel/Künstler] [Shuffle] [Zurück] [Play] [Vor] [Repeat]
 *          [Warteschlange] [Zeiten] [Lautstärke] [Mute] [ZURÜCK ZUM RADIO]
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePlayer } from '@/components/providers/PlayerProvider';
import PlayerBarShell from './PlayerBarShell';
import PlayerQueueDrawer from './PlayerQueueDrawer';

/** Sekunden → m:ss. Unbekannte Dauer (0/NaN) wird zu „–:––", nicht zu „0:00" —
 *  sonst behauptet die Anzeige eine Länge, die noch niemand kennt. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '–:––';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const PLAYER_ACCENT = '#8B5CF6'; // Boomy-Lila — sichtbar anders als jede Channel-Farbe

export default function PlayerModeBar() {
  const t = useTranslations('player');
  const {
    audio, playlist, analyser, hasQueue,
    handleTogglePlay, handleNext, handlePrev, returnToRadio,
  } = usePlayer();

  const [queueOpen, setQueueOpen] = useState(false);
  // Letzte hörbare Lautstärke merken, damit der Mute-Knopf sie zurückholt.
  const prevVolumeRef = useRef(0.7);
  useEffect(() => {
    if (audio.volume > 0) prevVolumeRef.current = audio.volume;
  }, [audio.volume]);
  const isMuted = audio.volume === 0;

  const current = audio.currentTrack;
  const duration = audio.duration || current?.duration || 0;
  const progressPct = duration > 0 ? Math.min(100, (audio.currentTime / duration) * 100) : 0;

  const seekToClientX = useCallback((clientX: number, el: HTMLElement) => {
    if (duration <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.seek(ratio * duration);
  }, [audio, duration]);

  // Tastatur auf dem Fortschritts-Regler: Pfeile ±5 s, Pos1/Ende an die Ränder.
  // Ohne das wäre Spulen ausschließlich per Maus/Finger möglich.
  const onProgressKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (duration <= 0) return;
    const step = e.shiftKey ? 30 : 5;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      audio.seek(Math.min(audio.currentTime + step, duration));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      audio.seek(Math.max(audio.currentTime - step, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      audio.seek(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      audio.seek(duration);
    }
  }, [audio, duration]);

  const repeatLabel = t('controls.repeat', {
    mode:
      playlist.repeatMode === 'off' ? t('controls.repeatOff')
        : playlist.repeatMode === 'all' ? t('controls.repeatAll')
          : t('controls.repeatOne'),
  });

  const iconButton = (active: boolean): React.CSSProperties => ({
    width: 40,
    height: 40,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(10,11,12,0.82)',
    border: `1px solid ${active ? PLAYER_ACCENT : 'rgba(255,255,255,0.18)'}`,
    color: active ? PLAYER_ACCENT : '#fff',
    cursor: 'pointer',
    flexShrink: 0,
  });

  return (
    <PlayerBarShell
      accent={PLAYER_ACCENT}
      equalizerColor={PLAYER_ACCENT}
      getFrequencyData={analyser.getFrequencyData}
      isActive={audio.isPlaying && audio.volume > 0}
      regionLabel={t('mode.regionLabel')}
      above={
        queueOpen ? (
          <PlayerQueueDrawer accent={PLAYER_ACCENT} onClose={() => setQueueOpen(false)} />
        ) : null
      }
    >
      {/* Fortschritt über die volle Breite — auf dem Handy die einzige Stelle,
          an der eine Spulleiste ohne Platznot unterkommt. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={t('progress.label')}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(audio.currentTime)}
        aria-valuetext={`${formatTime(audio.currentTime)} / ${formatTime(duration)}`}
        onKeyDown={onProgressKeyDown}
        onClick={(e) => seekToClientX(e.clientX, e.currentTarget)}
        style={{
          position: 'relative',
          zIndex: 10,
          height: 6,
          background: 'rgba(255,255,255,0.10)',
          cursor: duration > 0 ? 'pointer' : 'default',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: `${progressPct}%`,
            height: '100%',
            background: PLAYER_ACCENT,
            boxShadow: `0 0 8px ${PLAYER_ACCENT}`,
            transition: 'width 0.15s linear',
          }}
        />
      </div>

      <div
        className="kbk-playerbar-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          minHeight: 66,
          maxWidth: 1400,
          margin: '0 auto',
          position: 'relative',
          zIndex: 10,
          flexWrap: 'wrap',
        }}
      >
        {/* Cover — führt in die Vollbild-Ansicht */}
        <Link
          href="/player"
          aria-label={t('mode.expand')}
          title={t('mode.expand')}
          className="kbk-playerbar-cover"
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            position: 'relative',
            border: `1px solid ${PLAYER_ACCENT}55`,
            background: 'rgba(10,11,12,0.9)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {current?.coverUrl ? (
            <Image src={current.coverUrl} alt="" width={44} height={44} style={{ objectFit: 'cover' }} />
          ) : (
            <svg width={20} height={20} viewBox="0 0 24 24" fill={PLAYER_ACCENT} aria-hidden="true">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
          )}
        </Link>

        {/* Titel + Künstler */}
        <div className="kbk-playerbar-title" style={{ flex: '1 1 140px', minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: '0.04em',
              color: '#fff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textShadow: '0 0 6px rgba(0,0,0,0.85)',
            }}
            title={current?.title ?? ''}
          >
            {current?.title ?? t('mode.nothingLoaded')}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.14em',
              color: 'rgba(255,255,255,0.65)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {current?.artist ?? ''}
          </div>
        </div>

        {/* Zeiten — ab md, auf dem Handy nimmt der Streifen oben die Rolle ein */}
        <div
          className="hidden md:block"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.7)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {formatTime(audio.currentTime)} / {formatTime(duration)}
        </div>

        {/* Transport */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <button
            type="button"
            onClick={playlist.toggleShuffle}
            aria-pressed={playlist.shuffleEnabled}
            aria-label={playlist.shuffleEnabled ? t('controls.shuffleOff') : t('controls.shuffleOn')}
            title={playlist.shuffleEnabled ? t('controls.shuffleOff') : t('controls.shuffleOn')}
            className="hidden sm:inline-flex"
            style={iconButton(playlist.shuffleEnabled)}
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handlePrev}
            aria-label={t('controls.previous')}
            title={t('controls.previous')}
            style={iconButton(false)}
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="19,4 9,12 19,20" />
              <rect x="5" y="4" width="3" height="16" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={audio.isPlaying ? t('controls.pause') : t('controls.play')}
            title={audio.isPlaying ? t('controls.pause') : t('controls.play')}
            style={{ ...iconButton(true), width: 46, height: 46 }}
          >
            {audio.isPlaying ? (
              <svg width={19} height={19} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width={19} height={19} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="7,4 21,12 7,20" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={handleNext}
            aria-label={t('controls.next')}
            title={t('controls.next')}
            style={iconButton(false)}
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5,4 15,12 5,20" />
              <rect x="16" y="4" width="3" height="16" />
            </svg>
          </button>

          <button
            type="button"
            onClick={playlist.cycleRepeatMode}
            aria-pressed={playlist.repeatMode !== 'off'}
            aria-label={repeatLabel}
            title={repeatLabel}
            className="hidden sm:inline-flex"
            style={{ ...iconButton(playlist.repeatMode !== 'off'), position: 'relative' }}
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            {playlist.repeatMode === 'one' && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  fontSize: 8,
                  fontWeight: 900,
                  fontFamily: 'var(--font-mono)',
                  transform: 'translateY(1px)',
                }}
              >
                1
              </span>
            )}
          </button>
        </div>

        {/* Warteschlange */}
        <button
          type="button"
          onClick={() => setQueueOpen((v) => !v)}
          aria-expanded={queueOpen}
          aria-label={queueOpen ? t('queue.close') : t('queue.open')}
          title={queueOpen ? t('queue.close') : t('queue.open')}
          style={{ ...iconButton(queueOpen), position: 'relative' }}
        >
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M3 6h13M3 12h9M3 18h9M17 12v7a2 2 0 1 0 2-2h-2" />
          </svg>
          {hasQueue && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                minWidth: 16,
                height: 16,
                padding: '0 3px',
                borderRadius: 999,
                background: PLAYER_ACCENT,
                color: '#0B0B0F',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {playlist.tracks.length}
            </span>
          )}
        </button>

        {/* Lautstärke */}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(audio.volume * 100)}
          onChange={(e) => audio.setVolume(Number(e.target.value) / 100)}
          aria-label={t('volume.label')}
          className="hidden md:block"
          style={{ flexShrink: 0, width: 72, height: 4, accentColor: PLAYER_ACCENT, cursor: 'pointer' }}
        />
        <button
          type="button"
          onClick={() => audio.setVolume(isMuted ? (prevVolumeRef.current || 0.7) : 0)}
          aria-pressed={isMuted}
          aria-label={isMuted ? t('volume.unmute') : t('volume.mute')}
          title={isMuted ? t('volume.unmute') : t('volume.mute')}
          style={iconButton(false)}
        >
          {isMuted ? (
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
            </svg>
          ) : (
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
            </svg>
          )}
        </button>

        {/* Zurück in die Hausparty */}
        <button
          type="button"
          onClick={() => { void returnToRadio(); }}
          aria-label={t('mode.backToRadio')}
          title={t('mode.backToRadio')}
          className="kbk-playerbar-back"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 40,
            padding: '0 12px',
            background: 'rgba(10,11,12,0.9)',
            border: '1px solid rgba(255,255,255,0.35)',
            color: '#fff',
            fontFamily: 'var(--font-display)',
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.12em',
            cursor: 'pointer',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M4 12a8 8 0 0 1 8-8 8 8 0 0 1 8 8M8 20h8M12 12v8" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          <span className="hidden sm:inline">{t('mode.backToRadio')}</span>
        </button>
      </div>
    </PlayerBarShell>
  );
}
