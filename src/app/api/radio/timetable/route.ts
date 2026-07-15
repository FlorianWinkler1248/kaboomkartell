/**
 * Radio Timetable API Route
 *
 * GET /api/radio/timetable — Programm der nächsten 24 Stunden (Öffentlich)
 *
 * Wird auf der Landing Page für den Zeitstrahl genutzt.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getUpcoming, type RadioSlot, type RadioEvent, type RadioPool } from '@/lib/radio'

export async function GET(request: NextRequest) {
  try {
    const now = new Date()
    const hours = Number(request.nextUrl.searchParams.get('hours')) || 24

    const [slots, events, pools] = await Promise.all([
      prisma.timetableSlot.findMany({
        where: { isActive: true },
      }),
      prisma.timetableEvent.findMany({
        where: {
          isActive: true,
          // Einmalige zukünftige Events ODER wiederkehrende (ADR-028).
          OR: [
            { recurringDayOfWeek: { not: null } },
            { endTime: { gte: now } },
          ],
        },
      }),
      prisma.pool.findMany({
        where: { isActive: true },
        select: { id: true, name: true, genre: true },
      }),
    ])

    const radioSlots: RadioSlot[] = slots.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startHour: s.startHour,
      startMin: s.startMin,
      endHour: s.endHour,
      endMin: s.endMin,
      label: s.label,
      priority: s.priority,
      poolId: s.poolId,
    }))

    const radioEvents: RadioEvent[] = events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      startTime: e.startTime,
      endTime: e.endTime,
      eventType: e.eventType,
      poolId: e.poolId,
      streamUrl: e.streamUrl,
      // ADR-028: wiederkehrendes Live-Event (null = einmalig).
      recurringDayOfWeek: (e as { recurringDayOfWeek?: number | null }).recurringDayOfWeek ?? null,
    }))

    // Pools als Map (ohne Tracks, nur Metadaten für Labels)
    const poolMap = new Map<string, RadioPool>()
    for (const pool of pools) {
      poolMap.set(pool.id, { id: pool.id, name: pool.name, tracks: [] })
    }

    const upcoming = getUpcoming(radioSlots, radioEvents, poolMap, now, hours)

    return NextResponse.json({
      success: true,
      data: upcoming.map((entry) => ({
        id: entry.id,
        label: entry.label,
        startTime: entry.startTime.toISOString(),
        endTime: entry.endTime.toISOString(),
        type: entry.type,
        poolName: entry.poolName,
        eventType: entry.eventType,
        isLive: entry.isLive,
      })),
    })
  } catch (error) {
    console.error('Timetable-Vorschau Fehler:', error)
    return NextResponse.json({ success: false, error: 'Interner Fehler' }, { status: 500 })
  }
}
