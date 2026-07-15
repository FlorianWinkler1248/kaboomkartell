import prisma from '@/lib/db';
import { Music2, Users, Radio, Calendar } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import LiveStatsClient, { type LiveStatsCard } from './LiveStatsClient';
import { showVanity } from '@/lib/vanity';

/**
 * LiveStats — Impressionable Zahlen aus der Live-DB
 *
 * Server-Component: liest aktuelle Stats direkt aus der DB beim Request
 * und reicht sie (serialisiert) an den Client-Wrapper weiter, der das
 * Scroll-Reveal + Count-Up übernimmt. Lucide-Icons werden als Keys übergeben,
 * weil React-Komponenten nicht von Server an Client serialisierbar sind.
 */

async function loadStats() {
  try {
    const [trackCount, artistCount, slotCount] = await Promise.all([
      prisma.track.count({ where: { isPublic: true } }),
      prisma.user.count({ where: { role: { in: ['KUENSTLER', 'ADMIN'] } } }),
      prisma.timetableSlot.count({ where: { isActive: true } }),
    ]);
    return { trackCount, artistCount, slotCount };
  } catch {
    return { trackCount: 0, artistCount: 0, slotCount: 0 };
  }
}

export default async function LiveStats() {
  const t = await getTranslations('landing');
  const stats = await loadStats();

  const cards: LiveStatsCard[] = [
    {
      label: t('statsTracksReleased'),
      value: stats.trackCount,
      iconKey: 'music',
      accent: 'text-rasta-green',
      bg: 'bg-rasta-green/10',
      border: 'border-rasta-green/30',
    },
    // Vanity-Gate: „Artists on board" erst ab echtem Wert (sonst verrät „1" die
    // leere Künstler-Basis). Tracks/Slots/Channels bleiben — Katalog-Fakten.
    ...(showVanity(stats.artistCount, 'artists')
      ? [{
          label: t('statsArtistsOnBoard'),
          value: stats.artistCount,
          iconKey: 'users' as const,
          accent: 'text-rasta-yellow',
          bg: 'bg-rasta-yellow/10',
          border: 'border-rasta-yellow/30',
        }]
      : []),
    {
      label: t('statsWeeklySlots'),
      value: stats.slotCount,
      iconKey: 'calendar',
      accent: 'text-violet-400',
      bg: 'bg-violet-400/10',
      border: 'border-violet-400/30',
    },
    {
      label: t('statsChannels'),
      value: 3,
      iconKey: 'radio',
      accent: 'text-rasta-red',
      bg: 'bg-rasta-red/10',
      border: 'border-rasta-red/30',
    },
  ];

  return <LiveStatsClient cards={cards} />;
}

// Icon-Map wird im Client-Wrapper gehalten, hier nur Export der Icon-Referenzen
// für eventuelle Wiederverwendung (derzeit nicht genutzt, aber dokumentiert).
export const statsIconMap = {
  music: Music2,
  users: Users,
  calendar: Calendar,
  radio: Radio,
};
