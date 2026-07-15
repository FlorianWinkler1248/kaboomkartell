'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * JoinCTA — Bottom-Call-to-Action der Landing-Page
 *
 * Bewusst fett gestaltet (Flame-Icon, Gradient-Button), weil das hier die
 * Conversion-Stelle ist: "Du hast alles gesehen, jetzt sei dabei."
 * Zwei CTAs: primary (Join) + secondary (Keep listening).
 *
 * Animationen:
 *   - Scroll-Reveal (fade-in + slight-rise) via IntersectionObserver
 *   - Primary-Button pulsiert dezent (gradient-pulse in globals.css),
 *     um den Blick zur Conversion zu ziehen, ohne dass der Button tanzt.
 */

export default function JoinCTA() {
  const t = useTranslations('landing');
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={cn(
        'relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden transition-all duration-700 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
      {/* Gradient-Hintergrund */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 50%, var(--rasta-green) 0%, transparent 40%), radial-gradient(circle at 70% 50%, var(--rasta-red) 0%, transparent 40%)',
        }}
      />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <p className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.25em] text-rasta-red mb-4 uppercase">
          <span className="opacity-60">/05/</span>
          <Flame size={12} />
          {t('joinEyebrow')}
        </p>
        <h2 className="font-display text-4xl sm:text-5xl md:text-6xl leading-none mb-6 tracking-wider">
          {t('joinHeadingLine1')}<br />
          <span className="text-rasta-red text-glow-red">{t('joinHeadingLine2')}</span>
        </h2>
        <p className="text-lg text-secondary mb-10 max-w-xl mx-auto leading-relaxed">
          {t('joinDescription')}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link
            href="/register"
            className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-rasta-green text-white font-semibold hover:bg-rasta-green-light hover:scale-105 transition-all animate-gradient-pulse"
          >
            {t('joinPrimaryButton')}
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/library"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-border text-secondary hover:text-foreground hover:border-foreground/30 font-medium transition-all"
          >
            {t('joinSecondaryButton')}
          </Link>
        </div>
      </div>
    </section>
  );
}
