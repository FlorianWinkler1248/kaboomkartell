import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import HelpCenterView from './HelpCenterView';

/**
 * Öffentliches Hilfe-Center (/help).
 *
 * Zeigt die für End-User freigegebenen Workflows aus der Prozess-Bibliothek als
 * durchsuchbare Liste + Detail-Modal. Datenquelle ist die public API /api/processes
 * (server-seitig auf audience `end-user` gefiltert). Workflow-Inhalte gibt es nur auf
 * EN/DE — bewusst, da die Bibliothek nicht in ES/FR gepflegt wird.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.help');
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function HelpPage() {
  const t = await getTranslations('help');

  return (
    <section
      style={{
        padding: '40px 24px',
        maxWidth: 1080,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <SectionTitle sub="H" label={t('kicker')} title={t('title')} accent="green" />
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'rgba(255,255,255,0.65)',
          lineHeight: 1.7,
          marginTop: 14,
          marginBottom: 28,
          maxWidth: 660,
        }}
      >
        {t('intro')}
      </p>
      <HelpCenterView />
    </section>
  );
}
