'use client';

/**
 * LoadingSpinner - Animierter Lade-Indikator
 *
 * Rasta-farbiger Spinner in 3 Größen.
 * Verwendet CSS-Animation mit Rasta-Gradient als Rand.
 */

import { useTranslations } from 'next-intl';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-5 h-5 border-2',
  md: 'w-8 h-8 border-3',
  lg: 'w-12 h-12 border-4',
};

export default function LoadingSpinner({
  size = 'md',
  className = '',
}: LoadingSpinnerProps) {
  const t = useTranslations('commonUi');
  return (
    <div
      className={`${sizeMap[size]} rounded-full border-kbk-dark-700 border-t-rasta-green animate-spin ${className}`}
      role="status"
      aria-label={t('loading')}
    />
  );
}
