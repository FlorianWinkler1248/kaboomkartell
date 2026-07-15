'use client';

/**
 * RadioPlayerCockpit — ON-AIR Cockpit, gebunden an den globalen PlayerProvider.
 *
 * Design portiert aus "neues Design KBK/player.jsx", aber komplett echt:
 *  - Angezeigter Track = player.audio.currentTrack (nicht mehr Fake-Liste).
 *  - Progress = player.audio.currentTime / duration.
 *  - Play/Pause = toggelt echten Radio-Stream (enterRadioMode / pause).
 *  - Genre-Tabs = visuelle Filter für Visualizer-Farbe + Accent. Auto-aktiv
 *    basierend auf currentTrack.genre; User kann zwischen den 3 Hauptgenres
 *    switchen ohne das Playback zu unterbrechen (rein kosmetisch).
 *  - Canvas-Visualizer = echte FFT-Daten via player.analyser.getFrequencyData()
 *    mit Fallback auf Idle-Animation wenn noch nichts spielt.
 *  - AURA+/SUS = rein kosmetische Buttons (Click-Feedback); Real-Voting wäre
 *    ein zukuenftiges Feature auf Track-Level.
 *
 * Inline-Styles aus Artifact bleiben — das Design IST das Design.
 */

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { showVanity } from '@/lib/vanity';
import {
  IcoAura,
  IcoPause,
  IcoPlay,
  IcoPrev,
  IcoSkip,
  IcoSus,
  IcoVolume,
} from '@/components/kbk/icons';
import { usePlayer } from '@/components/providers/PlayerProvider';

type Genre = 'PHONK' | 'HARDTEK' | 'RAGGATEK';

const GENRE_COLORS: Record<Genre, string> = {
  PHONK: '#E63B2E',
  HARDTEK: '#F5D02E',
  RAGGATEK: '#3FCF4A',
};

const GENRE_RGB: Record<Genre, string> = {
  PHONK: '230,59,46',
  HARDTEK: '245,208,46',
  RAGGATEK: '63,207,74',
};

// Map beliebigen Genre-Strings auf unsere 3 Haupt-Tabs. Fallback: PHONK.
function normalizeGenre(raw: string | null | undefined): Genre {
  const g = (raw ?? '').toUpperCase();
  if (g.includes('HARDTEK') || g.includes('HARD')) return 'HARDTEK';
  if (g.includes('RAGGA')) return 'RAGGATEK';
  if (g.includes('PHONK')) return 'PHONK';
  if (g.includes('FRENCHCORE')) return 'HARDTEK';
  return 'PHONK';
}

// Visualizer-Props
interface VisualizerProps {
  playing: boolean;
  intensity?: number;
  genre: Genre;
  getFft: () => Uint8Array | null;
}

/**
 * Canvas-Visualizer — bindet sich an den globalen Analyser (via getFft).
 * Wenn keine echten FFT-Daten verfügbar sind (Idle, noch nie geplayt),
 * fällt er auf eine smooth random-Idle-Animation zurück, damit das UI nie stillsteht.
 */
const Visualizer = ({ playing, intensity = 1, genre, getFft }: VisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bars = 64;
  const genreColor = GENRE_COLORS[genre];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf: number;

    // Idle-State (nur wenn keine FFT-Daten verfügbar)
    const idleState: number[] = Array(bars).fill(0).map(() => Math.random());
    const idleTargets: number[] = Array(bars).fill(0).map(() => Math.random());

    const render = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const barWidth = width / bars;

      // Echte FFT-Daten holen (oder null → idle)
      const fft = getFft();
      const useReal = Boolean(fft && playing);

      for (let i = 0; i < bars; i++) {
        let activity: number;
        if (useReal && fft) {
          // FFT hat 64 bins — mappen direkt auf bars (1:1)
          activity = fft[i] / 255; // 0..1
        } else {
          // Idle-Animation — kraeftiger als vorher (war 0.12 → wirkte wie ein
          // duenner Streifen am Boden). 0.45 ergibt sichtbare Wellen.
          idleState[i] += (idleTargets[i] - idleState[i]) * 0.15;
          if (Math.random() < 0.04) idleTargets[i] = Math.random();
          activity = idleState[i] * (playing ? 0.55 : 0.45);
        }
        // Frequency-Envelope (Mitte lauter als Raender)
        const env = Math.sin((i / bars) * Math.PI) * 0.6 + 0.4;
        const h = activity * env * height * intensity;

        const grad = ctx.createLinearGradient(0, height, 0, height - h);
        grad.addColorStop(0, genreColor);
        grad.addColorStop(0.7, genre === 'PHONK' ? '#F5D02E' : '#3FCF4A');
        grad.addColorStop(1, '#fff');

        ctx.fillStyle = grad;
        const x = i * barWidth + 1;
        const y = height - h;
        ctx.fillRect(x, y, barWidth - 2, h);

        ctx.fillStyle = `rgba(255,255,255,${0.08 * activity})`;
        ctx.fillRect(x, height, barWidth - 2, h * 0.3);
      }
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [playing, intensity, genre, genreColor, getFft]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={90}
      // Niedriger als vorher (war 120) — wirkt kompakter, weniger leerer
      // schwarzer Block auf Mobile, Idle-Bars sehen lebendiger aus.
      style={{ width: '100%', height: 90, display: 'block' }}
    />
  );
};

interface Props {
  intensity?: number;
}

export default function RadioPlayerCockpit({ intensity = 1 }: Props) {
  const t = useTranslations('player');
  const player = usePlayer();
  const { audio, analyser } = player;
  const current = audio.currentTrack;
  const isPlaying = audio.isPlaying;

  // Genre-Tab: per default aus currentTrack.genre, User kann überschreiben.
  // Defensive Cast — PlayerTrack-Typ hat kein offizielles genre-Feld, manche
  // Quellen liefern es trotzdem mit. Bei null fällt normalizeGenre auf PHONK.
  const autoGenre = normalizeGenre(
    (current as { genre?: string | null } | null)?.genre ?? null
  );
  const [genreOverride, setGenreOverride] = useState<Genre | null>(null);
  const activeGenre: Genre = genreOverride ?? autoGenre;

  // Bei Track-Wechsel: Override ruecksetzen damit der neue Track das Genre übernimmt.
  useEffect(() => {
    setGenreOverride(null);
  }, [current?.id]);

  // Cosmetic Counter für AURA+/SUS (Click-Feedback — nicht persistent)
  const [auraBoost, setAuraBoost] = useState(0);
  const [susBoost, setSusBoost] = useState(0);
  const [bumpState, setBumpState] = useState<'aura' | 'sus' | null>(null);

  // Play-Toggle: echter Stream über PlayerProvider.
  const handlePlay = async () => {
    if (isPlaying) {
      audio.pause();
      return;
    }
    if (current) {
      await audio.resume?.();
      return;
    }
    try {
      await player.enterRadioMode();
    } catch (err) {
      console.error('[RadioPlayerCockpit] enterRadioMode failed:', err);
    }
  };

  // Progress-Click → seek.
  const handleProgressClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!current || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.seek?.(Math.max(0, Math.min(audio.duration, pct * audio.duration)));
  };

  // Volume-Click → echter Volume-Set.
  const handleVolumeClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.setVolume(v);
  };

  // FFT-Getter an Visualizer. Rueckgabe-Objekt wechselt nur, wenn Analyser neu wird.
  const getFftRef = useRef<() => Uint8Array | null>(() => null);
  useEffect(() => {
    getFftRef.current = analyser.isReady ? () => analyser.getFrequencyData() : () => null;
  }, [analyser]);
  const getFft = () => getFftRef.current();

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const genreColor = GENRE_COLORS[activeGenre];
  const genreRgb = GENRE_RGB[activeGenre];
  const bpm = (current as { bpm?: number | null } | null)?.bpm ?? null;

  // AURA/SUS Click → lokal boosten + visuelles Pop
  const bumpAura = () => {
    setAuraBoost((n) => n + 1);
    setBumpState('aura');
    setTimeout(() => setBumpState(null), 200);
  };
  const bumpSus = () => {
    setSusBoost((n) => n + 1);
    setBumpState('sus');
    setTimeout(() => setBumpState(null), 200);
  };

  // auraTotal / susTotal rein kosmetisch — existing Track-Fields werden hier NICHT
  // persistent manipuliert (das würde eigene Vote-API brauchen).
  const baseAura =
    (current as { auraCount?: number } | null)?.auraCount ??
    (current as { aura?: number } | null)?.aura ??
    0;
  const baseSus =
    (current as { susCount?: number } | null)?.susCount ??
    (current as { sus?: number } | null)?.sus ??
    0;
  const auraTotal = baseAura + auraBoost;
  const susTotal = baseSus + susBoost;

  return (
    <div
      style={{
        background: 'rgba(10,11,12,0.85)',
        border: `1px solid ${genreColor}`,
        boxShadow: `0 0 0 1px #000, 0 0 24px rgba(${genreRgb},0.25)`,
        padding: 0,
        borderRadius: 0,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* === Top-Bar: ON AIR + BPM === */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(90deg, rgba(0,0,0,0.6), transparent)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* On-Air-Dot — größer und mit doppeltem Pulse-Ring für mehr Praesenz */}
          <div style={{ position: 'relative', width: 14, height: 14 }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: isPlaying ? '#E63B2E' : 'rgba(255,255,255,0.25)',
                animation: isPlaying ? 'kk-pulse 1s infinite' : undefined,
                boxShadow: isPlaying ? '0 0 12px #E63B2E, 0 0 24px rgba(230,59,46,0.5)' : 'none',
              }}
            />
            {isPlaying && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: -6,
                  borderRadius: '50%',
                  border: '2px solid rgba(230,59,46,0.6)',
                  animation: 'kk-ripple 1.6s ease-out infinite',
                }}
              />
            )}
          </div>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              letterSpacing: '0.25em',
              color: isPlaying ? '#E63B2E' : 'rgba(255,255,255,0.4)',
              fontWeight: 900,
              textShadow: isPlaying ? '0 0 12px rgba(230,59,46,0.6)' : 'none',
            }}
          >
            {isPlaying ? t('status.onAir') : t('status.standby')}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.4)',
              marginLeft: 6,
            }}
          >
            {t('cockpit.uncut')}
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          <span style={{ color: genreColor }}>●</span> {bpm ? `${bpm} BPM` : '—'}
        </div>
      </div>

      {/* === Genre-Tabs — switchen Accent-Farbe, kein Track-Switch === */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {(['PHONK', 'HARDTEK', 'RAGGATEK'] as const).map((g) => {
          const c = GENRE_COLORS[g];
          const active = activeGenre === g;
          const style: CSSProperties = {
            flex: 1,
            // minWidth:0 = Tab darf schrumpfen wenn er zu breit ist
            minWidth: 0,
            // padding via clamp = auf Mobile schmaler, auf Desktop normal
            padding: 'clamp(10px, 3vw, 12px) clamp(4px, 1.5vw, 8px)',
            background: active ? c : 'transparent',
            color: active ? '#0A0B0C' : 'rgba(255,255,255,0.6)',
            border: 'none',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            fontFamily: 'var(--font-display)',
            // fontSize via clamp = "RAGGATEK" passt auch auf 412px
            fontSize: 'clamp(11px, 3.2vw, 14px)',
            fontWeight: 900,
            letterSpacing: 'clamp(0.05em, 0.6vw, 0.15em)',
            cursor: 'pointer',
            transition: 'all 0.15s',
            // Glow nur auf Desktop (>= md) — auf Mobile ist's zu schwammig
            textShadow: active ? 'none' : 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'clip',
          };
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGenreOverride(g)}
              style={style}
              aria-pressed={active}
            >
              {g}
            </button>
          );
        })}
      </div>

      {/* === Visualizer (Canvas) === */}
      <div style={{ background: '#000', position: 'relative' }}>
        <Visualizer
          playing={isPlaying}
          intensity={intensity}
          genre={activeGenre}
          getFft={getFft}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 3px)',
          }}
        />
      </div>

      {/* === Track-Info: aktueller Track aus PlayerProvider === */}
      <div style={{ padding: '20px 20px 12px' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.2em',
            marginBottom: 6,
          }}
        >
          {isPlaying ? t('cockpit.nowSpinning') : t('cockpit.readyToTuneIn')}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: '0.02em',
            lineHeight: 1,
            color: '#fff',
            textTransform: 'uppercase',
            textShadow: `0 0 20px ${genreColor}88`,
          }}
        >
          {current?.title ?? t('cockpit.tuneInToStart')}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: genreColor,
            marginTop: 6,
            letterSpacing: '0.1em',
          }}
        >
          {current?.artist ?? t('cockpit.pressPlay')}
        </div>
      </div>

      {/* === Progress-Bar === */}
      <div
        style={{
          padding: '0 20px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.6)',
            minWidth: 36,
          }}
        >
          {fmt(audio.currentTime || 0)}
        </span>
        <div
          style={{
            flex: 1,
            height: 4,
            background: 'rgba(255,255,255,0.1)',
            position: 'relative',
            cursor: current ? 'pointer' : 'default',
          }}
          onClick={handleProgressClick}
          role="slider"
          aria-label={t('progress.label')}
          aria-valuemin={0}
          aria-valuemax={audio.duration || 0}
          aria-valuenow={audio.currentTime || 0}
          tabIndex={0}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width:
                audio.duration > 0
                  ? `${((audio.currentTime || 0) / audio.duration) * 100}%`
                  : '0%',
              background: `linear-gradient(90deg, ${genreColor}, #fff)`,
              boxShadow: `0 0 8px ${genreColor}`,
              transition: 'width 0.2s linear',
            }}
          />
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.6)',
            minWidth: 36,
          }}
        >
          {fmt(audio.duration || 0)}
        </span>
      </div>

      {/* === Controls ===
          flexWrap: wrap für Mobile, sonst quetscht der Volume-Slider + AURA/SUS-Pills
          den Play-Button auf 412px-Viewport. */}
      <div
        style={{
          padding: '8px 20px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          style={btnGhost}
          onClick={() => audio.seek?.(Math.max(0, (audio.currentTime || 0) - 10))}
          aria-label={t('cockpit.back10')}
        >
          <IcoPrev size={16} />
        </button>
        <button
          type="button"
          onClick={handlePlay}
          aria-label={isPlaying ? t('controls.pause') : t('controls.play')}
          style={{
            width: 56,
            height: 56,
            borderRadius: 0,
            border: `2px solid ${genreColor}`,
            background: genreColor,
            color: '#0A0B0C',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 24px ${genreColor}`,
            transform: 'skewX(-8deg)',
          }}
        >
          <div style={{ transform: 'skewX(8deg)', display: 'flex' }}>
            {isPlaying ? <IcoPause size={32} /> : <IcoPlay size={32} />}
          </div>
        </button>
        <button
          type="button"
          style={btnGhost}
          onClick={() => audio.seek?.((audio.currentTime || 0) + 10)}
          aria-label={t('cockpit.forward10')}
        >
          <IcoSkip size={16} />
        </button>

        <div style={{ flex: 1 }} />

        <IcoVolume size={16} style={{ color: 'rgba(255,255,255,0.6)' }} />
        <div
          style={{
            width: 80,
            height: 4,
            background: 'rgba(255,255,255,0.1)',
            position: 'relative',
            cursor: 'pointer',
          }}
          onClick={handleVolumeClick}
          role="slider"
          aria-label={t('volume.label')}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={audio.volume}
          tabIndex={0}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: `${(audio.volume || 0) * 100}%`,
              background: '#fff',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          <button
            type="button"
            onClick={bumpAura}
            style={{
              ...pillBtn,
              borderColor: '#3FCF4A',
              color: '#3FCF4A',
              transform: bumpState === 'aura' ? 'scale(1.1)' : 'scale(1)',
            }}
          >
            <IcoAura size={16} />
            <span>AURA+</span>
            {showVanity(auraTotal, 'trackVotes') && (
              <span style={{ opacity: 0.6 }}>{auraTotal.toLocaleString('en-US')}</span>
            )}
          </button>
          <button
            type="button"
            onClick={bumpSus}
            style={{
              ...pillBtn,
              borderColor: susTotal > 50 ? '#E63B2E' : 'rgba(255,255,255,0.2)',
              color: susTotal > 50 ? '#E63B2E' : 'rgba(255,255,255,0.5)',
              transform: bumpState === 'sus' ? 'scale(1.1)' : 'scale(1)',
            }}
          >
            <IcoSus size={16} />
            <span>SUS</span>
            {showVanity(susTotal, 'trackVotes') && (
              <span style={{ opacity: 0.6 }}>{susTotal}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const btnGhost: CSSProperties = {
  // 44px Touch-Target. minWidth + flexShrink:0 weil der Flex-Container
  // sonst auf content-width zusammenstaucht (Volume-Slider + Pills daneben).
  width: 44,
  minWidth: 44,
  height: 44,
  flexShrink: 0,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'transparent',
  color: 'rgba(255,255,255,0.8)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s',
};

const pillBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  // 44px Mindesthoehe (WCAG 2.5.5)
  padding: '0 12px',
  minHeight: 44,
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.1em',
  fontWeight: 700,
  transition: 'transform 0.12s ease',
};
