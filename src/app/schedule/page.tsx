import DanceSprite from '@/components/kbk/DanceSprite';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import ScheduleView, {
  type ChannelData,
  type EventData,
  type Seg,
} from '@/components/kbk/sections/ScheduleView';

/**
 * /schedule — KBK-Sendeplan
 *
 * Bereitet server-seitig die Tages-Rotation (Phonk + Hardtek als Segmente) und
 * die tag-spezifischen Events auf und übergibt sie an die interaktive
 * `ScheduleView`-Insel (drei Zeit-Scopes: Jetzt / Heute / Woche). Die Rotation
 * ist an allen 7 Tagen identisch (verifiziert), deshalb reicht EIN Referenztag
 * (heute, UTC) für die Segmente; der Wochen-Scope zeigt nur, was sich
 * unterscheidet — die Events.
 *
 * Kein Player auf dieser Seite — die Musik läuft über den Mini-Player im Layout.
 */

const GREEN = '#3FCF4A';
const RED = '#E63B2E';
const YELLOW = '#F5D02E';
const PURPLE = '#9146FF';

function colorForGenre(genre: string | null | undefined): string {
  const g = (genre ?? '').toUpperCase();
  if (g.includes('BRAZILIAN') || g.includes('RAGGA')) return GREEN;
  if (g.includes('PHONK')) return RED;
  if (g.includes('HARDTEK') || g.includes('FRENCHCORE')) return YELLOW;
  return RED;
}
function channelForGenre(genre: string | null | undefined): 'phonk' | 'hardtek' {
  const g = (genre ?? '').toLowerCase();
  if (g.includes('hardtek') || g.includes('ragga') || g.includes('frenchcore')) return 'hardtek';
  return 'phonk';
}
const toMin = (h: number, m: number) => h * 60 + m;
function segEndMin(eh: number, em: number, startMin: number): number {
  let e = toMin(eh, em);
  if (e <= startMin) e = 1440;
  return Math.min(e, 1440);
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.schedule');
  return {
    title: t('title'),
    description: t('description'),
    openGraph: { title: t('ogTitle'), description: t('ogDescription') },
  };
}

// Force dynamic — Timetable ist live, Cache wäre kontraproduktiv.
export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const t = await getTranslations('schedule');
  const locale = await getLocale();

  const phonkSegs: Seg[] = [];
  const hardtekSegs: Seg[] = [];
  let events: EventData[] = [];
  let sameEveryDay = true;
  let hasData = false;

  try {
    const slots = await prisma.timetableSlot.findMany({
      where: { isActive: true },
      include: { pool: { select: { name: true, genre: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startHour: 'asc' }],
    });

    const now = new Date();
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const evRows = await prisma.timetableEvent.findMany({
      where: {
        isActive: true,
        OR: [{ recurringDayOfWeek: { not: null } }, { startTime: { gte: now, lte: sevenDaysAhead } }],
      },
      include: { pool: { select: { name: true, genre: true } } },
    });

    // Alle Tage identisch? (Signatur pro Tag vergleichen.)
    const byDay = new Map<number, string[]>();
    for (const s of slots) {
      const start = toMin(s.startHour, s.startMin);
      const sig = `${start}-${segEndMin(s.endHour, s.endMin, start)}:${s.pool?.genre ?? s.label ?? '?'}`;
      const a = byDay.get(s.dayOfWeek) ?? [];
      a.push(sig);
      byDay.set(s.dayOfWeek, a);
    }
    const sigSet = new Set([...byDay.values()].map((a) => a.sort().join('|')));
    sameEveryDay = sigSet.size <= 1;

    const todayDow = now.getUTCDay();
    const refDow = byDay.has(todayDow) ? todayDow : byDay.size ? [...byDay.keys()][0] : todayDow;
    const refSlots = slots.filter((s) => s.dayOfWeek === refDow);
    hasData = refSlots.length > 0;

    for (const s of refSlots) {
      const startMin = toMin(s.startHour, s.startMin);
      const seg: Seg = {
        startMin,
        endMin: segEndMin(s.endHour, s.endMin, startMin),
        color: colorForGenre(s.pool?.genre),
        genre: s.pool?.genre ?? s.label ?? t('rotation'),
      };
      if (channelForGenre(s.pool?.genre) === 'hardtek') hardtekSegs.push(seg);
      else phonkSegs.push(seg);
    }
    phonkSegs.sort((a, b) => a.startMin - b.startMin);
    hardtekSegs.sort((a, b) => a.startMin - b.startMin);

    const fmtDate = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', timeZone: 'UTC' });
    const fmtDay = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const dayLabel = (dow: number) => fmtDay.format(new Date(Date.UTC(2024, 0, 7 + dow))).toUpperCase();
    events = evRows
      .map((e) => {
        const rec = (e as { recurringDayOfWeek?: number | null }).recurringDayOfWeek ?? null;
        const isStream = e.eventType !== 'POOL';
        const startMin = toMin(e.startTime.getUTCHours(), e.startTime.getUTCMinutes());
        const endMin = toMin(e.endTime.getUTCHours(), e.endTime.getUTCMinutes());
        const timeStr = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
        const when = rec != null ? `${dayLabel(rec)} ${timeStr}` : `${fmtDate.format(e.startTime)} ${timeStr}`;
        return {
          id: e.id,
          label: e.title,
          color: isStream ? PURPLE : colorForGenre(e.pool?.genre),
          isStream,
          recurringDow: rec,
          startMin,
          endMin,
          whenLabel: when,
        };
      })
      .sort((a, b) => a.startMin - b.startMin);
  } catch (err) {
    console.error('SchedulePage query failed:', err);
  }

  const now = new Date();
  const todayIdx = (now.getUTCDay() + 6) % 7; // 0=Montag
  // Wochentags-Kürzel Mo..So (Montag-basiert), lokalisiert.
  const fmtDay = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    fmtDay.format(new Date(Date.UTC(2024, 0, 1 + i))).toUpperCase()
  );

  const channels: ChannelData[] = [
    { key: 'phonk', label: 'PHONK', accent: RED, segments: phonkSegs },
    { key: 'hardtek', label: 'HARDTEK', accent: YELLOW, segments: hardtekSegs },
  ];

  return (
    <div style={{ padding: '40px 24px 80px' }}>
      <SectionTitle sub="00" label={t('pageLabel')} title={t('pageTitle')} accent="green" />
      {/* ORB + TREAD warten in der Leerstelle — neutral, ohne Rahmen/Linien
          (Design-Regel 12.07., Workflow kbk-dance-sprites). */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: 4, paddingRight: 10 }}>
        <DanceSprite name="orb" size={44} bobDelayMs={-500} />
        <DanceSprite name="robo-tread" size={48} bobDelayMs={-1100} />
      </div>

      {!hasData ? (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.4)',
            marginTop: 20,
            letterSpacing: '0.1em',
          }}
        >
          {t('noSchedule')}
        </p>
      ) : (
        <ScheduleView
          serverTimeMs={now.getTime()}
          sameEveryDay={sameEveryDay}
          channels={channels}
          events={events}
          weekdayLabels={weekdayLabels}
          todayIdx={todayIdx}
        />
      )}
    </div>
  );
}
