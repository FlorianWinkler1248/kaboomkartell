/**
 * Pool-Tracks API Route
 *
 * POST   /api/admin/pools/[id]/tracks - Tracks zum Pool hinzufügen (Bulk)
 * DELETE /api/admin/pools/[id]/tracks - Track aus Pool entfernen
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const addTracksSchema = z.object({
  trackIds: z.array(z.string().min(1)).min(1, 'At least one track is required'),
})

const removeTrackSchema = z.object({
  trackId: z.string().min(1, 'Track ID is required'),
})

// POST /api/admin/pools/[id]/tracks — Tracks hinzufügen (Bulk)
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id: poolId } = await params
    const body = await request.json()
    const parsed = addTracksSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Pool existiert?
    const pool = await prisma.pool.findUnique({ where: { id: poolId } })
    if (!pool) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 })
    }

    // Bereits vorhandene Tracks im Pool ermitteln (Duplikate überspringen)
    const existing = await prisma.poolTrack.findMany({
      where: { poolId, trackId: { in: parsed.data.trackIds } },
      select: { trackId: true },
    })
    const existingIds = new Set(existing.map((e) => e.trackId))
    const newTrackIds = parsed.data.trackIds.filter((id) => !existingIds.has(id))

    if (newTrackIds.length === 0) {
      return NextResponse.json(
        { success: true, data: { added: 0, skipped: parsed.data.trackIds.length } }
      )
    }

    // Prüfen welche der Tracks tatsächlich existieren. Pool-Mitgliedschaft ist
    // unabhängig von isPublic — ein wartender Track darf im Pool sein.
    const validTracks = await prisma.track.findMany({
      where: { id: { in: newTrackIds } },
      select: { id: true },
    })
    const validIds = validTracks.map((t) => t.id)

    // Einzeln einfügen (SQLite unterstützt kein skipDuplicates in createMany)
    for (const trackId of validIds) {
      await prisma.poolTrack.create({ data: { poolId, trackId } })
    }

    return NextResponse.json({
      success: true,
      data: {
        added: validIds.length,
        skipped: parsed.data.trackIds.length - validIds.length,
      },
    })
  } catch (error) {
    return adminErrorResponse(error, 'Admin pool tracks add error:')
  }
}

// DELETE /api/admin/pools/[id]/tracks — Einzelnen Track entfernen
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id: poolId } = await params
    const body = await request.json()
    const parsed = removeTrackSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    await prisma.poolTrack.deleteMany({
      where: { poolId, trackId: parsed.data.trackId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return adminErrorResponse(error, 'Admin pool track remove error:')
  }
}
