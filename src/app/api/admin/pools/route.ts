/**
 * Pools API Route
 *
 * GET  /api/admin/pools - Alle Pools auflisten (nur Admin)
 * POST /api/admin/pools - Neuen Pool erstellen (nur Admin)
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { slugify } from '@/lib/utils'
import { createPoolSchema } from '@/lib/validations'

// GET /api/admin/pools — Alle Pools mit Track-Anzahl und Gesamtdauer
export async function GET() {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const pools = await prisma.pool.findMany({
      include: {
        tracks: {
          include: {
            track: {
              select: { id: true, title: true, duration: true, genre: true, isPublic: true },
            },
          },
        },
        ownerArtist: { select: { id: true, username: true, displayName: true } },
        _count: { select: { slots: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = pools.map((pool) => {
      const publicTracks = pool.tracks.filter((pt) => pt.track.isPublic)
      return {
        id: pool.id,
        name: pool.name,
        slug: pool.slug,
        description: pool.description,
        genre: pool.genre,
        ownerArtistId: pool.ownerArtistId,
        ownerArtist: pool.ownerArtist,
        isActive: pool.isActive,
        trackCount: publicTracks.length,
        totalTrackCount: pool.tracks.length,
        totalDuration: publicTracks.reduce((sum, pt) => sum + pt.track.duration, 0),
        slotCount: pool._count.slots,
        createdAt: pool.createdAt.toISOString(),
        updatedAt: pool.updatedAt.toISOString(),
      }
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return adminErrorResponse(error, 'Admin pools list error:')
  }
}

// POST /api/admin/pools — Neuen Pool erstellen
export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const body = await request.json()
    const parsed = createPoolSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { name, description, genre, ownerArtistId } = parsed.data
    const slug = slugify(name)

    // Slug-Duplikat prüfen
    const existing = await prisma.pool.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A pool with this name already exists' },
        { status: 409 }
      )
    }

    // Wenn ownerArtistId gesetzt: User muss existieren und KUENSTLER/ADMIN sein.
    if (ownerArtistId) {
      const owner = await prisma.user.findUnique({
        where: { id: ownerArtistId },
        select: { role: true },
      })
      if (!owner || (owner.role !== 'KUENSTLER' && owner.role !== 'ADMIN')) {
        return NextResponse.json(
          { success: false, error: 'Owner user must have the KUENSTLER or ADMIN role.' },
          { status: 400 }
        )
      }
    }

    const pool = await prisma.pool.create({
      data: {
        name,
        slug,
        description,
        genre,
        ownerArtistId: ownerArtistId ?? null,
      },
    })

    return NextResponse.json({ success: true, data: pool }, { status: 201 })
  } catch (error) {
    return adminErrorResponse(error, 'Admin pool create error:')
  }
}
