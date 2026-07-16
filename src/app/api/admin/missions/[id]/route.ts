/**
 * Admin Mission Detail API Route (ADR-039, Workflow: prozesse/kbk-mission-board.md)
 *
 * GET    /api/admin/missions/[id] - Mission-Details inkl. Acceptances (nur Admin)
 * PUT    /api/admin/missions/[id] - Mission aktualisieren (nur Admin)
 * DELETE /api/admin/missions/[id] - Mission löschen — NUR wenn ARCHIVED (nur Admin)
 *
 * Blaupause: /api/admin/pools/[id]. Archivieren ist der Soft-Delete des Boards;
 * der harte DELETE ist bewusst auf bereits archivierte Missionen begrenzt
 * (Guard 409), damit keine live sichtbare Mission versehentlich verschwindet.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { updateMissionSchema } from '@/lib/validations'

type Params = { params: Promise<{ id: string }> }

// GET /api/admin/missions/[id] — Details inkl. Acceptances (für den
// Acceptances-Aufklapper im Cockpit: wer hat angenommen, welcher Status).
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params

    const mission = await prisma.mission.findUnique({
      where: { id },
      include: {
        acceptances: {
          include: {
            user: { select: { id: true, username: true, displayName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!mission) {
      return NextResponse.json({ success: false, error: 'Mission not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: mission })
  } catch (error) {
    return adminErrorResponse(error, 'Admin mission detail error:')
  }
}

// PUT /api/admin/missions/[id] — Mission aktualisieren.
// Deckt Flows Pflege ab: Status-Wechsel (OPEN|PAUSED|COMPLETED|ARCHIVED),
// manuelles Fortschritts-Update und actionUrl-Nachtrag. Der Slug bleibt
// stabil (öffentliche URLs) — auch bei Titel-Änderung kein Re-Slugging.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    const body = await request.json()
    const parsed = updateMissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const mission = await prisma.mission.update({
      where: { id },
      data: parsed.data,
    })

    return NextResponse.json({ success: true, data: mission })
  } catch (error) {
    return adminErrorResponse(error, 'Admin mission update error:')
  }
}

// DELETE /api/admin/missions/[id] — Hard-Delete NUR für ARCHIVED-Missionen.
// Cascade räumt die MissionAcceptances mit ab (Prisma-Relation onDelete).
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params

    const mission = await prisma.mission.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!mission) {
      return NextResponse.json({ success: false, error: 'Mission not found' }, { status: 404 })
    }

    // Guard: live sichtbare Missionen (OPEN/PAUSED/COMPLETED) erst archivieren.
    if (mission.status !== 'ARCHIVED') {
      return NextResponse.json(
        { success: false, error: 'Only archived missions can be deleted. Archive it first.' },
        { status: 409 }
      )
    }

    await prisma.mission.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return adminErrorResponse(error, 'Admin mission delete error:')
  }
}
