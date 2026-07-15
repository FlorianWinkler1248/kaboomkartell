/**
 * Pool Detail API Route
 *
 * GET    /api/admin/pools/[id] - Pool-Details mit Tracks (nur Admin)
 * PUT    /api/admin/pools/[id] - Pool aktualisieren (nur Admin)
 * DELETE /api/admin/pools/[id] - Pool löschen (nur Admin)
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { updatePoolSchema } from '@/lib/validations'

type Params = { params: Promise<{ id: string }> }

// GET /api/admin/pools/[id] — Pool-Details mit allen Tracks
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params

    const pool = await prisma.pool.findUnique({
      where: { id },
      include: {
        tracks: {
          include: {
            track: {
              select: {
                id: true,
                title: true,
                slug: true,
                duration: true,
                genre: true,
                bpm: true,
                status: true,
                trackType: true,
                coverUrl: true,
                playCount: true,
                artist: { select: { id: true, username: true, displayName: true } },
                // v2.27: Featuring-Awareness im Pool-Manager
                // (formatArtistDisplay() braucht featuringArtist auf Track-Shape).
                featuringArtist: { select: { id: true, username: true, displayName: true } },
              },
            },
          },
          orderBy: { addedAt: 'desc' },
        },
      },
    })

    if (!pool) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: pool })
  } catch (error) {
    return adminErrorResponse(error, 'Admin pool detail error:')
  }
}

// PUT /api/admin/pools/[id] — Pool aktualisieren
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    const body = await request.json()
    const parsed = updatePoolSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const pool = await prisma.pool.update({
      where: { id },
      data: parsed.data,
    })

    return NextResponse.json({ success: true, data: pool })
  } catch (error) {
    return adminErrorResponse(error, 'Admin pool update error:')
  }
}

// DELETE /api/admin/pools/[id] — Pool löschen (Cascade löscht PoolTracks)
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params

    // Prüfen ob der Pool in aktiven Timetable-Slots verwendet wird
    const activeSlots = await prisma.timetableSlot.count({
      where: { poolId: id, isActive: true },
    })
    if (activeSlots > 0) {
      return NextResponse.json(
        { success: false, error: `Pool is used in ${activeSlots} active timetable slot(s).` },
        { status: 409 }
      )
    }

    await prisma.pool.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return adminErrorResponse(error, 'Admin pool delete error:')
  }
}
