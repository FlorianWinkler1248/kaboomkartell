/**
 * DropsSection — "ON THE DECKS NEXT"
 *
 * Server Component (async). Zeigt die nächsten 3 TimetableEvents (einmalige
 * Events im Sendeplan) aus der DB. Falls keine Events vorhanden sind, wird
 * auf Fake-Data aus dem Referenz-Artifact zurueckgefallen.
 *
 * Port aus neues Design KBK/app.jsx Zeilen 417-436 (Upcoming Drops).
 *
 * Hinweis: Wir nutzen TimetableEvent (konkrete Zeit + Titel) statt
 * TimetableSlot (wiederkehrender Wochenslot ohne Einzeltitel), weil wir pro
 * Card einen Titel + Artist + ETA brauchen.
 */

import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import { IcoCalendar } from '@/components/kbk/icons';
import { obsidianFrameVars } from '@/lib/obsidian-frame';

// next-intl-Translator-Typ für die ETA-Helper (home.drops-Namespace).
type DropsT = Awaited<ReturnType<typeof getTranslations<'home.drops'>>>;

// === Farben aus Root-Spec ===
const GREEN = '#3FCF4A';
const RED = '#E63B2E';
const YELLOW = '#F5D02E';

// Genre → Farbe Mapping (für Tag-Corner + Accent). Liefert `null` wenn das
// Genre keiner Spezialfarbe zuzuordnen ist — der Caller rotiert dann selbst.
// Reihenfolge ist wichtig: Brazilian Phonk + Raggatek vor 'PHONK' prüfen,
// sonst matched 'PHONK' zuerst und Brazilian landet fälschlich auf rot.
function colorForGenre(genre: string | null | undefined): string | null {
  const g = (genre ?? '').toUpperCase();
  if (g.includes('BRAZILIAN') || g.includes('RAGGA')) return GREEN;
  if (g.includes('PHONK')) return RED;
  if (g.includes('HARDTEK') || g.includes('FRENCHCORE')) return YELLOW;
  return null;
}

// Einheitliches Shape für Rendering
type DropCard = {
  title: string;
  artist: string;
  eta: string;
  tag: string;
  color: string;
};

// Relativer ETA-String — "in 12m", "tonight 22:00", "fri 02:00", ...
// Übersetzt via home.drops-Catalog (named interpolation für Minuten/Stunden/Zeit).
function formatEta(start: Date, t: DropsT): string {
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / (1000 * 60));

  if (diffMin <= 0) return t('etaLiveNow');
  if (diffMin < 60) return t('etaInMinutes', { count: diffMin });
  if (diffMin < 180) {
    const hours = Math.round(diffMin / 60);
    return t('etaInHours', { count: hours });
  }

  // Gleicher Tag (bis Mitternacht)
  const isSameDay =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate();
  const hh = start.getHours().toString().padStart(2, '0');
  const mm = start.getMinutes().toString().padStart(2, '0');

  if (isSameDay) return t('etaTonight', { time: `${hh}:${mm}` });

  // Wochentag bleibt locale-agnostisch über die Browser-Intl-Kürzel (mon/tue/…),
  // die Zeit hängt dahinter. UI-Länge: 3-Buchstaben-Kürzel + HH:MM.
  const weekday = start.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
  return `${weekday} ${hh}:${mm}`;
}

// Nächste Occurrence eines wiederkehrenden TimetableSlot relativ zu `now`.
function nextSlotOccurrence(
  slot: { dayOfWeek: number; startHour: number; startMin: number },
  now: Date
): Date {
  const result = new Date(now);
  const currentDow = now.getDay();
  let daysAhead = (slot.dayOfWeek - currentDow + 7) % 7;
  if (daysAhead === 0) {
    const slotMins = slot.startHour * 60 + slot.startMin;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    if (slotMins <= nowMins) daysAhead = 7;
  }
  result.setDate(result.getDate() + daysAhead);
  result.setHours(slot.startHour, slot.startMin, 0, 0);
  return result;
}

export default async function DropsSection() {
  const t = await getTranslations('home.drops');
  const tk = await getTranslations('kbkUi');

  let cards: DropCard[] = [];

  try {
    // 1. Priorisiert: einmalige TimetableEvents in der Zukunft
    const events = await prisma.timetableEvent.findMany({
      take: 3,
      where: {
        isActive: true,
        startTime: { gte: new Date() },
      },
      orderBy: { startTime: 'asc' },
      select: {
        title: true,
        description: true,
        startTime: true,
        pool: { select: { name: true, genre: true } },
      },
    });

    const rotation = [RED, GREEN, YELLOW];

    cards = events.map((e, i) => {
      const tag = e.pool?.genre ? e.pool.genre.toUpperCase() : tk('dropTagLive');
      const color = colorForGenre(e.pool?.genre) ?? rotation[i % rotation.length];

      return {
        title: e.title,
        artist: e.description ?? (e.pool?.name ?? '4FLOW'),
        eta: formatEta(e.startTime, t),
        tag,
        color,
      };
    });

    // 2. Falls weniger als 3 Events: Auffüllen mit den nächsten wiederkehrenden Slots
    if (cards.length < 3) {
      const now = new Date();
      const slots = await prisma.timetableSlot.findMany({
        where: { isActive: true },
        include: { pool: { select: { name: true, genre: true } } },
      });

      const slotCards: (DropCard & { _occurrence: number })[] = slots.map(
        (slot, i) => {
          const occ = nextSlotOccurrence(slot, now);
          const genre = slot.pool?.genre ?? null;
          const color = colorForGenre(genre) ?? rotation[(cards.length + i) % rotation.length];
          return {
            title: slot.label ?? slot.pool?.name ?? 'POOL ROTATION',
            artist: slot.pool?.name ?? 'KBK RADIO',
            eta: formatEta(occ, t),
            tag: (genre ?? 'ROTATION').toUpperCase(),
            color,
            _occurrence: occ.getTime(),
          };
        }
      );

      slotCards.sort((a, b) => a._occurrence - b._occurrence);
      const need = 3 - cards.length;
      cards = cards.concat(
        slotCards.slice(0, need).map(
          ({ title, artist, eta, tag, color }): DropCard => ({
            title,
            artist,
            eta,
            tag,
            color,
          })
        )
      );
    }
  } catch (err) {
    console.error('DropsSection query failed:', err);
    cards = [];
  }

  return (
    <div className="kbk-page-section" style={{ padding: '20px 24px' }}>
      <SectionTitle sub="03" label={t('sectionLabel')} title={t('sectionTitle')} />
      {cards.length === 0 && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.4)',
            marginTop: 20,
            letterSpacing: '0.1em',
          }}
        >
          {t('empty')}
        </p>
      )}
      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 10,
        }}
      >
        {cards.map((d, i) => (
          <div
            key={`${d.title}-${i}`}
            className="kbk-obsidian framed"
            style={{
              ...obsidianFrameVars(d.color),
              padding: 16,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Tag-Corner oben rechts (Genre-Label) */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                background: d.color,
                color: '#0A0B0C',
                padding: '3px 10px',
                fontFamily: 'var(--font-display)',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {d.tag}
            </div>
            {/* Title */}
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 900,
                color: '#fff',
                marginTop: 14,
                textTransform: 'uppercase',
                letterSpacing: '0.01em',
              }}
            >
              {d.title}
            </div>
            {/* Artist */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'rgba(255,255,255,0.6)',
                marginTop: 4,
                letterSpacing: '0.1em',
              }}
            >
              {d.artist}
            </div>
            {/* ETA mit Kalender-Icon */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: d.color,
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                letterSpacing: '0.1em',
              }}
            >
              <IcoCalendar size={12} /> {d.eta.toUpperCase()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
