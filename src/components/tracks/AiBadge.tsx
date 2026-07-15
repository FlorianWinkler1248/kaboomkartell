'use client';

/**
 * AiBadge — Zeigt den KI-Disclosure-Status eines Tracks an
 *
 * Drei Varianten: AI Generated (violett), AI Assisted (bernstein),
 * Human Made (grün). Bei hohem sus-Prozentsatz (≥80%) wird
 * zusätzlich ein "Likely AI"-Warn-Badge angezeigt.
 */

import { Bot, Sparkles, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { VOTING_CONFIG } from '@/lib/constants';

interface AiBadgeProps {
  aiDisclosure: string | null;
  aiSource?: string | null;
  susPercentage?: number;
  size?: 'sm' | 'md';
}

// Badge-Konfiguration je nach Disclosure-Typ
const BADGE_VARIANTS: Record<
  string,
  {
    labelKey: 'aiGenerated' | 'aiAssisted' | 'humanMade';
    icon: typeof Bot;
    className: string;
  }
> = {
  ai_generated: {
    labelKey: 'aiGenerated',
    icon: Bot,
    className: 'bg-violet-400/10 text-violet-400 border border-violet-400/20',
  },
  ai_assisted: {
    labelKey: 'aiAssisted',
    icon: Sparkles,
    className: 'bg-amber-400/10 text-amber-400 border border-amber-400/20',
  },
  human: {
    labelKey: 'humanMade',
    icon: User,
    className: 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20',
  },
};

export default function AiBadge({
  aiDisclosure,
  aiSource,
  susPercentage,
  size = 'sm',
}: AiBadgeProps) {
  const t = useTranslations('widgetsUi');
  // Kein Badge wenn kein Disclosure gesetzt
  if (!aiDisclosure) return null;

  const variant = BADGE_VARIANTS[aiDisclosure];
  if (!variant) return null;

  const Icon = variant.icon;
  const isSm = size === 'sm';

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Haupt-Badge */}
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full font-medium',
          variant.className,
          isSm ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
        )}
      >
        <Icon className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        {t(variant.labelKey)}
        {/* Quelle anzeigen bei AI Generated (z.B. "suno", "udio") */}
        {aiDisclosure === 'ai_generated' && aiSource && (
          <span className="opacity-60 ml-0.5">({aiSource})</span>
        )}
      </span>

      {/* "Likely AI"-Warnung bei hohem sus-Prozentsatz */}
      {susPercentage != null &&
        susPercentage >= VOTING_CONFIG.susThreshold && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full font-medium',
              'bg-red-500/10 text-red-400 border border-red-500/20',
              isSm ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
            )}
          >
            {t('likelyAi')}
          </span>
        )}
    </div>
  );
}
