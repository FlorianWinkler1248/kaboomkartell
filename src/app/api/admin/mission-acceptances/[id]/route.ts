/**
 * Admin Mission-Acceptance API Route (ADR-039, Workflow: prozesse/kbk-mission-board.md)
 *
 * PUT /api/admin/mission-acceptances/[id] - Acceptance-Status setzen (nur Admin)
 *
 * COMPLETED setzt NUR Flow hier im Cockpit (Erfüllungs-Anerkennung) — der
 * User selbst kann über die Public-Routen nur annehmen/widerrufen. ACCEPTED
 * und WITHDRAWN sind zusätzlich erlaubt, damit Flow einen Fehlgriff (falsche
 * Zeile completed) zurückdrehen kann.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'

type Params = { params: Promise<{ id: string }> }

// Route-lokales Schema (Datei-Disziplin im Parallel-Betrieb: validations.ts
// gehört dem Missions-Schema-Strang — dieser Admin-Handgriff bleibt lokal).
const updateAcceptanceStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'WITHDRAWN', 'COMPLETED']),
})

// PUT /api/admin/mission-acceptances/[id] — Status-Übergang durch Flow.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    const body = await request.json()
    const parsed = updateAcceptanceStatusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // P2025 (Zeile existiert nicht mehr) mappt adminErrorResponse auf 404.
    const acceptance = await prisma.missionAcceptance.update({
      where: { id },
      data: { status: parsed.data.status },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
      },
    })

    return NextResponse.json({ success: true, data: acceptance })
  } catch (error) {
    return adminErrorResponse(error, 'Admin mission acceptance update error:')
  }
}
