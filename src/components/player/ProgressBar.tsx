'use client';

/**
 * ProgressBar-Komponente
 *
 * Klickbare Fortschrittsanzeige mit Rasta-Gradient-Fill.
 * Migriert von: .progress-bar im Original.
 *
 * Features:
 * - Click-to-Seek (wie im Original)
 * - Drag-to-Seek
 * - Hover-Vorschau der Zeit
 * - Rasta-Gradient für den Fortschritt
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { formatTime } from '@/lib/utils';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (timeInSeconds: number) => void;
}

export default function ProgressBar({ currentTime, duration, onSeek }: ProgressBarProps) {
  const t = useTranslations('player');
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Berechnet die Zeit aus einer Mouse-Position
  const getTimeFromPosition = useCallback(
    (clientX: number): number => {
      const bar = barRef.current;
      if (!bar || duration <= 0) return 0;

      const rect = bar.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return percent * duration;
    },
    [duration]
  );

  // Click-to-Seek (migriert von: progressBar.addEventListener('click'))
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const time = getTimeFromPosition(e.clientX);
      onSeek(time);
    },
    [getTimeFromPosition, onSeek]
  );

  // Hover-Vorschau
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const bar = barRef.current;
      if (!bar || duration <= 0) return;

      const rect = bar.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      setHoverPercent(Math.max(0, Math.min(100, percent)));
    },
    [duration]
  );

  const handleMouseLeave = useCallback(() => {
    if (!isDragging) {
      setHoverPercent(null);
    }
  }, [isDragging]);

  // Drag-to-Seek
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      const time = getTimeFromPosition(e.clientX);
      onSeek(time);
    },
    [getTimeFromPosition, onSeek]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const time = getTimeFromPosition(e.clientX);
      onSeek(time);
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setHoverPercent(null);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, getTimeFromPosition, onSeek]);

  return (
    <div className="mt-4">
      {/* Progress Bar */}
      <div
        ref={barRef}
        className="group relative h-2 rounded-full bg-kbk-dark-800 cursor-pointer overflow-hidden transition-all hover:h-3"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        role="slider"
        aria-label={t('progress.label')}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        tabIndex={0}
      >
        {/* Hover-Highlight */}
        {hoverPercent !== null && (
          <div
            className="absolute inset-y-0 left-0 bg-white/5 rounded-full pointer-events-none"
            style={{ width: `${hoverPercent}%` }}
          />
        )}

        {/* Progress Fill mit Rasta-Gradient */}
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{
            width: `${progressPercent}%`,
            background: 'var(--gradient-progress)',
          }}
        />

        {/* Hover-Tooltip */}
        {hoverPercent !== null && duration > 0 && (
          <div
            className="absolute -top-8 -translate-x-1/2 px-2 py-1 bg-kbk-dark-800 rounded text-xs text-foreground pointer-events-none whitespace-nowrap z-10"
            style={{ left: `${hoverPercent}%` }}
          >
            {formatTime((hoverPercent / 100) * duration)}
          </div>
        )}
      </div>

      {/* Zeitanzeige */}
      <div className="flex justify-between mt-1.5 text-xs text-muted tabular-nums">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
