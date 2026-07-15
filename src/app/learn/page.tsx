import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

/**
 * /learn — Redirect zum Synth Lab unter /learn/synthesizer.
 *
 * TopNavBar nutzt "LEARN" als Label, aktuell gibt es nur den Synth-Lab
 * als Sub-Page. Wenn weitere Lab-Module kommen, wird das hier zur
 * Index-Page mit Lab-Karten umgebaut.
 *
 * Metadata ist bereits uebersetzbar (meta.learn) — sie greift, bevor der
 * Redirect feuert, und ist vorbereitet fuer den spaeteren Index-Umbau.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.learn');
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default function LearnRedirect() {
  redirect('/learn/synthesizer');
}
