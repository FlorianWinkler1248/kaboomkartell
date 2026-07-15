'use client';

/**
 * VolumeControl-Komponente
 *
 * Lautstaerke-Slider mit Prozentanzeige und Mute-Toggle.
 * Migriert von: .volume-control im Original.
 */

import { useState, useCallback } from 'react';
import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface VolumeControlProps {
  volume: number; // 0-1
  onVolumeChange: (volume: number) => void;
}

export default function VolumeControl({ volume, onVolumeChange }: VolumeControlProps) {
  const t = useTranslations('player');
  const [previousVolume, setPreviousVolume] = useState(0.7);

  const volumePercent = Math.round(volume * 100);

  // Icon basierend auf Lautstaerke
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // Mute-Toggle
  const toggleMute = useCallback(() => {
    if (volume > 0) {
      setPreviousVolume(volume);
      onVolumeChange(0);
    } else {
      onVolumeChange(previousVolume);
    }
  }, [volume, previousVolume, onVolumeChange]);

  // Slider-Change
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value) / 100;
      onVolumeChange(newVolume);
    },
    [onVolumeChange]
  );

  return (
    <div className="flex items-center gap-2">
      {/* Mute-Button */}
      <button
        onClick={toggleMute}
        className={cn(
          'p-1.5 rounded transition-colors cursor-pointer',
          volume === 0
            ? 'text-rasta-red hover:text-rasta-red/80'
            : 'text-muted hover:text-foreground'
        )}
        aria-label={volume === 0 ? t('volume.unmute') : t('volume.mute')}
        title={volume === 0 ? t('volume.unmute') : t('volume.mute')}
      >
        <VolumeIcon size={18} />
      </button>

      {/* Volume-Slider */}
      <div className="relative flex items-center flex-1 min-w-[80px] max-w-[140px]">
        <input
          type="range"
          min="0"
          max="100"
          value={volumePercent}
          onChange={handleSliderChange}
          className="volume-slider w-full"
          aria-label={t('volume.label')}
        />
      </div>

      {/* Prozent-Anzeige */}
      <span className="text-xs text-muted tabular-nums w-8 text-right">
        {volumePercent}%
      </span>
    </div>
  );
}
