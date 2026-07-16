/**
 * Admin Artist-Application Detail API Route (ADR-039, Workflow: prozesse/kbk-artist-onboarding.md §C12)
 *
 * PUT /api/admin/artist-applications/[id] - Status-Übergang durch Flow (nur Admin)
 *
 * PENDING → REVIEWED → ACCEPTED | DECLINED. Absage lässt Account und
 * unique-Block bestehen (kein Re-Apply). Kein DELETE in v1 — DSGVO-Löschweg
 * ist ein manueller Admin-DB-Schritt (im Workflow dokumentiert). Das
 * eigentliche Onboarding bei Zusage (Rolle KUENSTLER, Pool, Socials, Uploads)
 * läuft manuell über die bestehende Admin-Mechanik.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'

type Params = { params: Promise<{ id: string }> }

// Route-lokales Schema — unbekannter Status → 400 (Workflow-Test
// "Status-Übergang").
const updateApplicationStatusSchema = z.object({
  status: z.enum(['PENDING', 'REVIEWED', 'ACCEPTED', 'DECLINED']),
})

// PUT /api/admin/artist-applications/[id] — Status setzen.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    const body = await request.json()
    const parsed = updateApplicationStatusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // P2025 (Record existiert nicht) mappt adminErrorResponse auf 404.
    const application = await prisma.artistApplication.update({
      where: { id },
      data: { status: parsed.data.status },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, email: true, role: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: application })
  } catch (error) {
    return adminErrorResponse(error, 'Admin artist application update error:')
  }
}
