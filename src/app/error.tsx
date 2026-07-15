'use client';

/**
 * Error-Boundary - Globaler Fehler-Handler
 *
 * Fängt unerwartete Fehler auf allen Seiten ab.
 * Zeigt eine benutzerfreundliche Meldung mit Retry-Option.
 * Next.js rendert diese Komponente automatisch bei unbehandelten Fehlern.
 */

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  const t = useTranslations('error');

  useEffect(() => {
    console.error('Unbehandelter Fehler:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-rasta-red/10 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={32} className="text-rasta-red" />
        </div>

        <h2 className="font-heading font-bold text-2xl text-foreground mb-3">
          {t('heading')}
        </h2>
        <p className="text-secondary mb-6">
          {t('body')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-rasta-green rounded-lg hover:bg-rasta-green-light transition-all flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw size={16} />
            {t('tryAgain')}
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-2.5 text-sm font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            {t('goHome')}
          </button>
        </div>
      </div>
    </div>
  );
}
