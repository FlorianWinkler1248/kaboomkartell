/**
 * Timetable Event Detail API Route
 *
 * PUT    /api/admin/timetable/events/[id] - Event aktualisieren (Admin)
 * DELETE /api/admin/timetable/events/[id] - Event löschen (Admin)
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  eventType: z.enum(['POOL', 'YOUTUBE', 'TWITCH']).optional(),
  poolId: z.string().optional().nullable(),
  streamUrl: z.string().url().optional().nullable(),
  isActive: z.boolean().optional(),
  // v2.31: Subgenre-Override für Live-Events (raggatek im Hardtek-Channel etc.)
  subgenre: z.enum(['raggatek', 'brazilian-phonk']).nullable().optional(),
})

// PUT /api/admin/timetable/events/[id]
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    const body = await request.json()
    const parsed = updateEventSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data: Record<string, unknown> = { ...parsed.data }
    if (data.startTime) data.startTime = new Date(data.startTime as string)
    if (data.endTime) data.endTime = new Date(data.endTime as string)

    const event = await prisma.timetableEvent.update({
      where: { id },
      data,
      include: { pool: { select: { id: true, name: true } } },
    })

    return NextResponse.json({ success: true, data: event })
  } catch (error) {
    return adminErrorResponse(error, 'Admin timetable event update error:')
  }
}

// DELETE /api/admin/timetable/events/[id]
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    await prisma.timetableEvent.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return adminErrorResponse(error, 'Admin timetable event delete error:')
  }
}
