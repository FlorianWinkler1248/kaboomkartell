/**
 * Timetable Events API Route
 *
 * POST /api/admin/timetable/events - Neues Event erstellen (Admin)
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { createTimetableEventSchema } from '@/lib/validations'

// POST /api/admin/timetable/events — Event erstellen
export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const body = await request.json()
    const parsed = createTimetableEventSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { title, description, startTime, endTime, eventType, poolId, streamUrl, subgenre, recurringDayOfWeek } = parsed.data

    // Validierung: POOL-Events brauchen eine Pool-ID
    if (eventType === 'POOL' && !poolId) {
      return NextResponse.json(
        { success: false, error: 'Pool events require a pool ID.' },
        { status: 400 }
      )
    }

    // Validierung: Live-Events brauchen eine Stream-URL
    if ((eventType === 'YOUTUBE' || eventType === 'TWITCH') && !streamUrl) {
      return NextResponse.json(
        { success: false, error: 'Live events require a stream URL.' },
        { status: 400 }
      )
    }

    // Start muss vor Ende liegen. Bei wiederkehrenden Events darf das Fenster über
    // Mitternacht gehen (z.B. 22–02) → Check nur für einmalige Events (ADR-028).
    if (recurringDayOfWeek == null && new Date(startTime) >= new Date(endTime)) {
      return NextResponse.json(
        { success: false, error: 'Start time must be before end time.' },
        { status: 400 }
      )
    }

    const event = await prisma.timetableEvent.create({
      data: {
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        eventType,
        poolId: eventType === 'POOL' ? poolId : null,
        streamUrl: eventType !== 'POOL' ? streamUrl : null,
        subgenre: subgenre ?? null,
        recurringDayOfWeek: recurringDayOfWeek ?? null,
      },
      include: { pool: { select: { id: true, name: true } } },
    })

    return NextResponse.json({ success: true, data: event }, { status: 201 })
  } catch (error) {
    return adminErrorResponse(error, 'Admin timetable event create error:')
  }
}
