/**
 * Timetable Slots API Route
 *
 * GET  /api/admin/timetable - Alle Wochen-Slots + Events laden (Admin)
 * POST /api/admin/timetable - Neuen Wochen-Slot erstellen (Admin)
 *      Unterstützt repeatDays für Mehrfach-Erstellung
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { createTimetableSlotSchema } from '@/lib/validations'

// GET /api/admin/timetable — Alle Slots + Events
export async function GET() {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const [slots, events] = await Promise.all([
      prisma.timetableSlot.findMany({
        where: { isActive: true },
        include: { pool: { select: { id: true, name: true, genre: true } } },
        orderBy: [{ dayOfWeek: 'asc' }, { startHour: 'asc' }, { startMin: 'asc' }],
      }),
      prisma.timetableEvent.findMany({
        where: { isActive: true, endTime: { gte: new Date() } },
        include: { pool: { select: { id: true, name: true } } },
        orderBy: { startTime: 'asc' },
      }),
    ])

    return NextResponse.json({ success: true, data: { slots, events } })
  } catch (error) {
    return adminErrorResponse(error, 'Admin timetable list error:')
  }
}

// POST /api/admin/timetable — Neuen Slot erstellen
export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const body = await request.json()
    const parsed = createTimetableSlotSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { dayOfWeek, startHour, startMin, endHour, endMin, label, poolId, priority, repeatDays } = parsed.data

    // Pool existiert?
    const pool = await prisma.pool.findUnique({ where: { id: poolId } })
    if (!pool) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 })
    }

    // Tage bestimmen: repeatDays oder einzelner dayOfWeek
    const days = repeatDays && repeatDays.length > 0 ? repeatDays : [dayOfWeek]

    // Für jeden Tag einen Slot erstellen
    const created = []
    for (const day of days) {
      const slot = await prisma.timetableSlot.create({
        data: {
          dayOfWeek: day,
          startHour,
          startMin,
          endHour,
          endMin,
          label,
          poolId,
          priority,
        },
        include: { pool: { select: { id: true, name: true, genre: true } } },
      })
      created.push(slot)
    }

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    return adminErrorResponse(error, 'Admin timetable slot create error:')
  }
}
