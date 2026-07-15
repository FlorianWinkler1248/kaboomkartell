/**
 * Timetable Slot Detail API Route
 *
 * PUT    /api/admin/timetable/[id] - Slot aktualisieren (Admin)
 * DELETE /api/admin/timetable/[id] - Slot löschen (Admin)
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const updateSlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startHour: z.number().int().min(0).max(23).optional(),
  startMin: z.number().int().min(0).max(59).optional(),
  endHour: z.number().int().min(0).max(23).optional(),
  endMin: z.number().int().min(0).max(59).optional(),
  label: z.string().max(100).optional().nullable(),
  poolId: z.string().min(1).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

// PUT /api/admin/timetable/[id]
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    const body = await request.json()
    const parsed = updateSlotSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const slot = await prisma.timetableSlot.update({
      where: { id },
      data: parsed.data,
      include: { pool: { select: { id: true, name: true, genre: true } } },
    })

    return NextResponse.json({ success: true, data: slot })
  } catch (error) {
    return adminErrorResponse(error, 'Admin timetable slot update error:')
  }
}

// DELETE /api/admin/timetable/[id]
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    await prisma.timetableSlot.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return adminErrorResponse(error, 'Admin timetable slot delete error:')
  }
}
