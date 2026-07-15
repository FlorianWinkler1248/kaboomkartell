/**
 * Loading - Globaler Lade-Zustand
 *
 * Wird von Next.js automatisch angezeigt während Seiten-Übergänge.
 * Zentrierter Spinner mit Rasta-Farbe.
 */

import { getTranslations } from 'next-intl/server';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default async function Loading() {
  const t = await getTranslations('commonUi');
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-muted text-sm animate-pulse">{t('loading')}</p>
      </div>
    </div>
  );
}
