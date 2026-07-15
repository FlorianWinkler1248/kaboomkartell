'use client';

/**
 * VotingStats — Zeigt Aura-Count und Sus-Prozentsatz an
 *
 * Wird auf Track-Karten und der Detail-Seite verwendet.
 * Zwei Größen: kompakt (sm) für Karten, ausführlich (md)
 * mit Fortschrittsbalken für die Detail-Ansicht.
 */

import { Zap, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { showVanity } from '@/lib/vanity';

interface VotingStatsProps {
  auraCount: number;
  susCount: number;
  totalVotes: number;
  susPercentage: number;
  size?: 'sm' | 'md';
}

export default function VotingStats({
  auraCount,
  totalVotes,
  susPercentage,
  size = 'sm',
}: VotingStatsProps) {
  const t = useTranslations('widgetsUi');
  // Vanity-Gate: unter dem Schwellwert keine kleinen Zahlen zeigen. sm blendet
  // ganz aus; md zeigt die „Listen to vote"-Einladung (CTA statt leerer Zähler).
  const hasVotes = showVanity(totalVotes, 'trackVotes');
  if (!hasVotes && size === 'sm') return null;

  if (!hasVotes && size === 'md') {
    return (
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5 text-rasta-green/50">
          <Zap className="w-4 h-4" />
          <span>aura+</span>
        </span>
        <span className="text-white/20">|</span>
        <span className="inline-flex items-center gap-1.5 text-rasta-red/50">
          <Eye className="w-4 h-4" />
          <span>sus?</span>
        </span>
        <span className="text-white/30">— {t('noVotesYet')}</span>
      </div>
    );
  }

  if (size === 'sm') {
    // Kompakte Darstellung für Track-Karten
    return (
      <div className="flex items-center gap-2 text-xs text-white/50">
        {/* Aura-Zähler */}
        <span className="inline-flex items-center gap-1 text-rasta-green/70">
          <Zap className="w-3 h-3" />
          {auraCount}
        </span>

        <span className="text-white/20">|</span>

        {/* Sus-Prozentsatz */}
        <span className="inline-flex items-center gap-1 text-rasta-red/70">
          <Eye className="w-3 h-3" />
          {susPercentage}%
        </span>
      </div>
    );
  }

  // Ausführliche Darstellung mit Fortschrittsbalken
  return (
    <div className="space-y-2">
      {/* Zahlen-Übersicht */}
      <div className="flex items-center gap-3 text-sm">
        {/* Aura-Zähler */}
        <span className="inline-flex items-center gap-1.5 text-rasta-green">
          <Zap className="w-4 h-4" />
          <span className="font-medium">{auraCount}</span>
          <span className="text-rasta-green/60">aura</span>
        </span>

        <span className="text-white/20">|</span>

        {/* Sus-Prozentsatz */}
        <span className="inline-flex items-center gap-1.5 text-rasta-red">
          <Eye className="w-4 h-4" />
          <span className="font-medium">{susPercentage}%</span>
          <span className="text-rasta-red/60">sus</span>
        </span>

        <span className="text-white/20">|</span>

        {/* Gesamtanzahl Votes */}
        <span className="text-white/50">
          {t('voteCount', { count: totalVotes })}
        </span>
      </div>

      {/* Sus-Fortschrittsbalken */}
      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            susPercentage >= 80
              ? 'bg-red-500'
              : susPercentage >= 50
                ? 'bg-rasta-red/70'
                : 'bg-rasta-red/40'
          )}
          style={{ width: `${Math.min(susPercentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
