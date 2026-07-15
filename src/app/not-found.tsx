/**
 * 404 Not Found - Seite nicht gefunden
 *
 * Benutzerfreundliche 404-Seite mit Navigation zurück zur Startseite.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Home, ArrowLeft } from 'lucide-react';

export default async function NotFound() {
  const t = await getTranslations('error');

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Große 404 */}
        <h1 className="font-heading font-bold text-8xl sm:text-9xl mb-2">
          <span className="text-rasta-gradient">404</span>
        </h1>

        <h2 className="font-heading font-bold text-2xl text-foreground mb-3">
          {t('notFound.heading')}
        </h2>
        <p className="text-secondary mb-8">
          {t('notFound.body')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="px-6 py-2.5 text-sm font-semibold text-white bg-rasta-green rounded-lg hover:bg-rasta-green-light transition-all flex items-center gap-2"
          >
            <Home size={16} />
            {t('goHome')}
          </Link>
          <Link
            href="/library"
            className="px-6 py-2.5 text-sm font-semibold text-muted hover:text-foreground transition-colors flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            {t('notFound.browseLibrary')}
          </Link>
        </div>
      </div>
    </div>
  );
}
