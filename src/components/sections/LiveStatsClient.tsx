'use client';

import { useEffect, useRef, useState } from 'react';
import { Music2, Users, Radio, Calendar, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * LiveStatsClient — Client-Wrapper für die Live-Zahlen
 *
 * Übernimmt vom Server-Component die serialisierte Card-Liste (mit iconKey
 * statt Komponenten-Referenz) und kuemmert sich um:
 *   - Scroll-Reveal via IntersectionObserver (fade-in + slight-rise)
 *   - Count-Up der Zahlen über ~1s ab Sichtbarkeit (requestAnimationFrame)
 *   - String-Werte (z. B. "24/7") werden nicht animiert, sondern direkt gezeigt
 */

type IconKey = 'music' | 'users' | 'calendar' | 'radio';

export interface LiveStatsCard {
  label: string;
  value: number | string;
  iconKey: IconKey;
  accent: string;
  bg: string;
  border: string;
}

const ICON_MAP: Record<IconKey, LucideIcon> = {
  music: Music2,
  users: Users,
  calendar: Calendar,
  radio: Radio,
};

const COUNT_UP_DURATION_MS = 1000;

interface Props {
  cards: LiveStatsCard[];
}

export default function LiveStatsClient({ cards }: Props) {
  const t = useTranslations('landing');
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  // Displayed values pro Card-Index — starten auf 0 für Zahlen, direkt final für Strings
  const [displayValues, setDisplayValues] = useState<(number | string)[]>(() =>
    cards.map((c) => (typeof c.value === 'number' ? 0 : c.value))
  );

  // Scroll-Reveal
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

  // Count-Up — läuft erst los wenn die Section sichtbar ist
  useEffect(() => {
    if (!visible) return;

    // Reduced-Motion? Direkt auf Zielwert springen, keine Animation.
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setDisplayValues(cards.map((c) => c.value));
      return;
    }

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / COUNT_UP_DURATION_MS, 1);
      // ease-out cubic für natuerliches Auslaufen
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplayValues(
        cards.map((c) => {
          if (typeof c.value !== 'number') return c.value;
          return Math.round(c.value * eased);
        })
      );

      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, cards]);

  return (
    <section
      ref={sectionRef}
      className={cn(
        'py-12 sm:py-16 px-4 sm:px-6 lg:px-8 transition-all duration-700 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
      <div className="max-w-5xl mx-auto">
        <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-muted mb-8">
          {t('statsEyebrow')}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((card, idx) => {
            const Icon = ICON_MAP[card.iconKey];
            const shown = displayValues[idx];
            return (
              <div
                key={card.label}
                className="rounded-xl bg-surface/60 backdrop-blur-sm border border-border p-5 text-center hover:border-foreground/20 transition-all"
              >
                <div
                  className={`w-10 h-10 rounded-full ${card.bg} border ${card.border} flex items-center justify-center mx-auto mb-3`}
                >
                  <Icon size={16} className={card.accent} />
                </div>
                <p className={`font-heading font-black text-3xl sm:text-4xl ${card.accent} tabular-nums`}>
                  {shown}
                </p>
                <p className="text-xs text-muted mt-1 uppercase tracking-wider">{card.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
