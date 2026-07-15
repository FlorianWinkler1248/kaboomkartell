'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Zap, Users, Radio, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * MissionBanner — Die Kern-Botschaft unterhalb des Hero
 *
 * Beantwortet für Besucher: "Was ist KBK und warum sollte ich dabei sein?"
 * Drei Saeulen (Radio / Crew / Drops), visuell als Cards mit Icons.
 * CTA-frei hier — dient dem Verstehen, nicht dem Abschluss.
 *
 * Scroll-Reveal via IntersectionObserver — fade-in + slight-rise, sobald
 * die Section in den Viewport kommt (triggert einmalig).
 */

export default function MissionBanner() {
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
          observer.disconnect(); // einmalig reichen
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={cn(
        'relative py-16 sm:py-24 px-4 sm:px-6 lg:px-8 overflow-hidden transition-all duration-700 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
      {/* Subtiler Background-Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-kbk-black via-kbk-dark-900/40 to-kbk-black pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Headline */}
        <div className="text-center mb-12 sm:mb-16">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.25em] text-rasta-green mb-4 uppercase">
            <span className="opacity-60">/01/</span>
            <Sparkles size={12} />
            {t('missionEyebrow')}
          </p>
          <h2 className="font-display text-4xl sm:text-5xl md:text-6xl leading-none mb-6 tracking-wider">
            {t('missionHeadingLine1')}<br />
            <span className="text-rasta-green text-glow-green">{t('missionHeadingLine2')}</span><br />
            <span className="text-secondary text-2xl sm:text-3xl md:text-4xl tracking-widest">{t('missionHeadingLine3')}</span>
          </h2>
          <p className="text-lg sm:text-xl text-secondary leading-relaxed max-w-2xl mx-auto">
            {t.rich('missionTagline', {
              crew: (chunks) => (
                <span className="text-foreground font-semibold">{chunks}</span>
              ),
              br: () => <br className="hidden sm:inline" />,
            })}
          </p>
        </div>

        {/* Drei Saeulen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Radio */}
          <div className="rounded-2xl bg-surface/80 backdrop-blur-sm border border-border p-6 group hover:border-rasta-green/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-rasta-green/10 border border-rasta-green/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Radio size={22} className="text-rasta-green" />
            </div>
            <h3 className="font-heading font-bold text-xl mb-2">{t('missionPillarRadioTitle')}</h3>
            <p className="text-sm text-secondary leading-relaxed">
              {t('missionPillarRadioText')}
            </p>
          </div>

          {/* Crew */}
          <div className="rounded-2xl bg-surface/80 backdrop-blur-sm border border-border p-6 group hover:border-rasta-yellow/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-rasta-yellow/10 border border-rasta-yellow/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Users size={22} className="text-rasta-yellow" />
            </div>
            <h3 className="font-heading font-bold text-xl mb-2">{t('missionPillarCrewTitle')}</h3>
            <p className="text-sm text-secondary leading-relaxed">
              {t('missionPillarCrewText')}
            </p>
          </div>

          {/* AI Resident */}
          <div className="rounded-2xl bg-surface/80 backdrop-blur-sm border border-border p-6 group hover:border-violet-400/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-violet-400/10 border border-violet-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Zap size={22} className="text-violet-400" />
            </div>
            <h3 className="font-heading font-bold text-xl mb-2">{t('missionPillarAiTitle')}</h3>
            <p className="text-sm text-secondary leading-relaxed">
              {t.rich('missionPillarAiText', {
                boomy: (chunks) => (
                  <Link href="/profile/boomy" className="text-violet-400 hover:text-violet-300 font-medium">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
