import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * HeroSection - Vollbild-Startbereich
 *
 * Wolf-Logo mit Rasta-Glow, Gradient-Text Titel,
 * CTA-Buttons (Musik entdecken + Mitmachen), Scroll-Indikator.
 * Subtiles Dot-Pattern im Hintergrund.
 */

export default function HeroSection() {
  const t = useTranslations('landing');

  return (
    <section className="relative flex flex-col items-center justify-center min-h-[85vh] px-4 overflow-hidden">
      {/* Hintergrund-Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-kbk-black via-kbk-dark-900 to-kbk-black" />

      {/* Subtiles Dot-Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 25% 25%, var(--rasta-green) 1px, transparent 1px), radial-gradient(circle at 75% 75%, var(--rasta-red) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto">
        {/* Wolf Logo */}
        <div className="relative mb-8">
          <div
            className="absolute inset-0 rounded-full blur-3xl opacity-20"
            style={{ background: 'var(--gradient-rasta)' }}
          />
          <Image
            src="/images/logo-4flow.png"
            alt="KaboomKartell - 4Flow Wolf Logo"
            width={200}
            height={200}
            priority
            className="relative rounded-full shadow-2xl"
          />
        </div>

        {/* Titel */}
        <h1 className="font-heading font-bold text-5xl sm:text-6xl lg:text-7xl mb-4 tracking-tight">
          <span className="text-rasta-gradient">Kaboom</span>
          <span className="text-foreground">Kartell</span>
        </h1>

        {/* Untertitel */}
        <p className="text-xl sm:text-2xl text-secondary mb-3 font-light">
          {t('heroSubtitlePrefix')}{' '}
          <span className="font-semibold text-foreground">4Flow</span>
        </p>
        <p className="text-lg text-muted mb-10 max-w-2xl">
          Raggatek &bull; Hardtek &bull; Community
        </p>

        {/* CTA Buttons */}
        <nav aria-label="Main actions" className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/library"
            className="px-8 py-3.5 text-lg font-semibold text-white bg-rasta-green rounded-lg hover:bg-rasta-green-light transition-all hover:shadow-lg hover:shadow-rasta-green/20"
          >
            {t('heroDiscoverMusic')}
          </Link>
          <Link
            href="/register"
            className="px-8 py-3.5 text-lg font-semibold text-rasta-green border-2 border-rasta-green rounded-lg hover:bg-rasta-green hover:text-white transition-all"
          >
            {t('heroJoinUs')}
          </Link>
        </nav>
      </div>

      {/* Scroll-Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-muted rounded-full flex justify-center">
          <div className="w-1.5 h-3 bg-muted rounded-full mt-2" />
        </div>
      </div>
    </section>
  );
}
