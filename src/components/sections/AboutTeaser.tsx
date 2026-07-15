import Image from 'next/image';
import Link from 'next/link';
import { Users, Headphones, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * AboutTeaser - Kurze Vorstellung des KaboomKartell
 *
 * Links: Text mit 3 Feature-Highlights (Icons)
 * Rechts: Wolf-Logo mit Rasta-Glow
 */

export default function AboutTeaser() {
  const t = useTranslations('landing');

  const features = [
    {
      icon: Headphones,
      color: 'text-rasta-green',
      text: t('aboutFeatureGenres'),
    },
    {
      icon: Users,
      color: 'text-rasta-yellow',
      text: t('aboutFeatureCommunity'),
    },
    {
      icon: Zap,
      color: 'text-rasta-red',
      text: t('aboutFeatureProjects'),
    },
  ];

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-12">
        <div className="flex-1">
          <h2 className="font-heading font-bold text-3xl sm:text-4xl mb-6">
            {t('aboutHeadingPrefix')}{' '}
            <span className="text-rasta-gradient">KaboomKartell</span>?
          </h2>
          <p className="text-secondary text-lg leading-relaxed mb-8">
            {t('aboutDescription')}
          </p>

          {/* Feature-Punkte */}
          <ul className="space-y-4 mb-8">
            {features.map((feature) => (
              <li key={feature.text} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-kbk-dark-800 flex items-center justify-center shrink-0">
                  <feature.icon size={20} className={feature.color} />
                </div>
                <span className="text-foreground">{feature.text}</span>
              </li>
            ))}
          </ul>

          <Link
            href="/about"
            className="text-rasta-green hover:text-rasta-green-light font-medium transition-colors"
          >
            {t('aboutLearnMore')} &rarr;
          </Link>
        </div>

        <div className="flex-1 flex justify-center">
          <div className="relative w-64 h-64">
            <div
              className="absolute inset-0 rounded-full blur-2xl opacity-15"
              style={{ background: 'var(--gradient-rasta)' }}
            />
            <Image
              src="/images/logo-4flow.png"
              alt="4Flow"
              width={256}
              height={256}
              className="relative rounded-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
