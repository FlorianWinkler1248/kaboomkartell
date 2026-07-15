'use client';

/**
 * PlayerControls-Komponente
 *
 * Steuerungselemente: Prev, Play/Pause, Next, Shuffle, Repeat.
 * Migriert von: .player-controls im Original.
 *
 * Icon-Zuordnung:
 * - ⏮ -> SkipBack
 * - ▶/⏸ -> Play/Pause
 * - ⏭ -> SkipForward
 * - 🔀 -> Shuffle
 * - 🔁/🔂 -> Repeat/Repeat1
 */

import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { RepeatMode } from '@/lib/constants';

interface PlayerControlsProps {
  isPlaying: boolean;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  hasTrack: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
}

export default function PlayerControls({
  isPlaying,
  shuffleEnabled,
  repeatMode,
  hasTrack,
  hasPrev,
  hasNext,
  onTogglePlay,
  onPrev,
  onNext,
  onToggleShuffle,
  onCycleRepeat,
}: PlayerControlsProps) {
  const t = useTranslations('player');
  const shuffleLabel = shuffleEnabled ? t('controls.shuffleOff') : t('controls.shuffleOn');
  const repeatLabel = t('controls.repeat', {
    mode:
      repeatMode === 'off'
        ? t('controls.repeatOff')
        : repeatMode === 'all'
          ? t('controls.repeatAll')
          : t('controls.repeatOne'),
  });
  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4">
      {/* Shuffle */}
      <button
        onClick={onToggleShuffle}
        disabled={!hasTrack}
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer',
          'disabled:opacity-30 disabled:cursor-not-allowed',
          shuffleEnabled
            ? 'text-rasta-green bg-rasta-green/10 hover:bg-rasta-green/20'
            : 'text-muted hover:text-foreground hover:bg-kbk-dark-700'
        )}
        aria-label={shuffleLabel}
        title={shuffleLabel}
      >
        <Shuffle size={18} />
      </button>

      {/* Previous */}
      <button
        onClick={onPrev}
        disabled={!hasTrack || !hasPrev}
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer',
          'text-secondary hover:text-foreground hover:bg-kbk-dark-700',
          'disabled:opacity-30 disabled:cursor-not-allowed'
        )}
        aria-label={t('controls.previous')}
        title={t('controls.previous')}
      >
        <SkipBack size={20} />
      </button>

      {/* Play / Pause (großer Button) */}
      <button
        onClick={onTogglePlay}
        disabled={!hasTrack}
        className={cn(
          'w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer',
          'disabled:opacity-30 disabled:cursor-not-allowed',
          hasTrack
            ? 'bg-rasta-green text-white hover:bg-rasta-green-light hover:scale-105 active:scale-95 shadow-lg shadow-rasta-green/20'
            : 'bg-kbk-dark-700 text-muted'
        )}
        aria-label={isPlaying ? t('controls.pause') : t('controls.play')}
        title={isPlaying ? t('controls.pause') : t('controls.play')}
      >
        {isPlaying ? (
          <Pause size={24} fill="currentColor" />
        ) : (
          <Play size={24} fill="currentColor" className="ml-1" />
        )}
      </button>

      {/* Next */}
      <button
        onClick={onNext}
        disabled={!hasTrack || !hasNext}
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer',
          'text-secondary hover:text-foreground hover:bg-kbk-dark-700',
          'disabled:opacity-30 disabled:cursor-not-allowed'
        )}
        aria-label={t('controls.next')}
        title={t('controls.next')}
      >
        <SkipForward size={20} />
      </button>

      {/* Repeat */}
      <button
        onClick={onCycleRepeat}
        disabled={!hasTrack}
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer relative',
          'disabled:opacity-30 disabled:cursor-not-allowed',
          repeatMode !== 'off'
            ? 'text-rasta-yellow bg-rasta-yellow/10 hover:bg-rasta-yellow/20'
            : 'text-muted hover:text-foreground hover:bg-kbk-dark-700'
        )}
        aria-label={repeatLabel}
        title={repeatLabel}
      >
        {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
        {/* Dot-Indicator für aktiven Repeat */}
        {repeatMode !== 'off' && (
          <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-rasta-yellow" />
        )}
      </button>
    </div>
  );
}
