import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/**
 * SEO-Metadaten für die Synthesizer Learn-Seite.
 * Wird von Next.js automatisch in den <head> eingefügt.
 * Lokalisiert über den meta-Namespace (Cookie-Locale, ADR-031).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');

  return {
    title: t('synth.title'),
    description: t('synth.description'),
    keywords: t('synth.keywords')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    openGraph: {
      title: t('synth.ogTitle'),
      description: t('synth.ogDescription'),
    },
  };
}

export default function SynthesizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
