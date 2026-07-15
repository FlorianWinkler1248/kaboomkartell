import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

/**
 * GET /api/kbk/next-drop
 *
 * Liefert das nächste Event/Slot für den TopNav-Ticker.
 * Priorisiert einmalige TimetableEvents mit startTime > now();
 * fallback auf nächsten wiederkehrenden TimetableSlot.
 *
 * Response:
 *  {
 *    title:     string,   // "RAGGA TERREUR" oder Pool-Name
 *    startsIn:  string,   // "04:47" (MM:SS), "2h 14m", "tomorrow 20:00"
 *    startsAt:  string,   // ISO
 *    kind:      "EVENT" | "SLOT",
 *  } | null
 */

// Force dynamic — analog zu /api/kbk/stats: Build-Time-Cache mit leerer DB
// würde die UI auf "TBD" einfrieren. Wir wollen Live-Werte.
export const dynamic = 'force-dynamic';

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'NOW';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) {
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  const hours = Math.floor(mins / 60);
  const restMin = mins % 60;
  if (hours < 24) return `${hours}h ${restMin}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

// Nächsten wiederkehrenden Slot relativ zu `now` berechnen (7 Tage voraus).
function nextSlotOccurrence(
  slot: { dayOfWeek: number; startHour: number; startMin: number },
  now: Date
): Date {
  const result = new Date(now);
  const currentDow = now.getDay(); // 0=Sun..6=Sat
  let daysAhead = (slot.dayOfWeek - currentDow + 7) % 7;
  if (daysAhead === 0) {
    // gleicher Tag: nur wenn Slot noch nicht vorbei ist
    const slotMinsOfDay = slot.startHour * 60 + slot.startMin;
    const nowMinsOfDay = now.getHours() * 60 + now.getMinutes();
    if (slotMinsOfDay <= nowMinsOfDay) daysAhead = 7;
  }
  result.setDate(result.getDate() + daysAhead);
  result.setHours(slot.startHour, slot.startMin, 0, 0);
  return result;
}

export async function GET() {
  try {
    const now = new Date();

    // 1. Einmaliges Event > now → höchste Prio
    const nextEvent = await prisma.timetableEvent.findFirst({
      where: {
        isActive: true,
        startTime: { gt: now },
      },
      include: { pool: { select: { name: true, genre: true } } },
      orderBy: { startTime: 'asc' },
    });

    if (nextEvent) {
      const startsInMs = nextEvent.startTime.getTime() - now.getTime();
      return NextResponse.json({
        title: nextEvent.title.toUpperCase(),
        startsIn: formatCountdown(startsInMs),
        startsAt: nextEvent.startTime.toISOString(),
        kind: 'EVENT',
      });
    }

    // 2. Fallback: Nächsten wiederkehrenden Slot
    const slots = await prisma.timetableSlot.findMany({
      where: { isActive: true },
      include: { pool: { select: { name: true } } },
    });

    if (slots.length === 0) return NextResponse.json(null);

    let best: (typeof slots)[number] | null = null;
    let bestTime = Number.POSITIVE_INFINITY;
    for (const slot of slots) {
      const occ = nextSlotOccurrence(slot, now);
      const delta = occ.getTime() - now.getTime();
      if (delta >= 0 && delta < bestTime) {
        bestTime = delta;
        best = slot;
      }
    }

    if (!best) return NextResponse.json(null);

    const occ = nextSlotOccurrence(best, now);
    const title = (best.label || best.pool?.name || 'NEXT DROP').toUpperCase();
    return NextResponse.json({
      title,
      startsIn: formatCountdown(occ.getTime() - now.getTime()),
      startsAt: occ.toISOString(),
      kind: 'SLOT',
    });
  } catch (err) {
    console.error('KBK next-drop error:', err);
    return NextResponse.json(null);
  }
}
