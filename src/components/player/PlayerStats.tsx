'use client';

/**
 * PlayerStats-Komponente
 *
 * Zeigt Statistiken: Gesamt-Tracks, Gespielte, Gesamtdauer.
 * Migriert von: .stats-container im Original.
 */

import { useTranslations } from 'next-intl';
import { BarChart3, Clock, Disc3 } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import type { PlayerStats as PlayerStatsType } from '@/types';

interface PlayerStatsProps {
  stats: PlayerStatsType;
}

export default function PlayerStats({ stats }: PlayerStatsProps) {
  const t = useTranslations('playerUi');
  return (
    <div className="flex items-center gap-4 sm:gap-6 text-sm">
      {/* Gesamt */}
      <div className="flex items-center gap-1.5 text-muted" title={t('tracksInPlaylist')}>
        <Disc3 size={14} className="text-rasta-green" />
        <span className="tabular-nums">
          {t('trackCount', { count: stats.total })}
        </span>
      </div>

      {/* Gespielt */}
      <div className="flex items-center gap-1.5 text-muted" title={t('tracksListenedTo')}>
        <BarChart3 size={14} className="text-rasta-yellow" />
        <span className="tabular-nums">
          {t('playedCount', { count: stats.played })}
        </span>
      </div>

      {/* Gesamtdauer */}
      <div className="flex items-center gap-1.5 text-muted" title={t('totalPlaytime')}>
        <Clock size={14} className="text-rasta-red" />
        <span className="tabular-nums">
          {formatTime(stats.totalDuration)}
        </span>
      </div>
    </div>
  );
}
