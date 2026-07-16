/**
 * Admin Artist-Applications API Route (ADR-039, Workflow: prozesse/kbk-artist-onboarding.md §C)
 *
 * GET /api/admin/artist-applications - Bewerbungs-Liste, optional ?status=-Filter (nur Admin)
 *
 * Das Cockpit zeigt AUSDRÜCKLICH auch mailSent=false-Bewerbungen ("mail
 * failed"-Badge) — kein stiller Verlust bei SMTP-Ausfall. Kein DELETE in v1:
 * der DSGVO-Löschweg ist ein manueller Admin-DB-Schritt (siehe Workflow,
 * Fehler-Szenario "DSGVO-Löschersuchen").
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'

// Gültige Status-Filter — alles andere wird ignoriert (Liste ungefiltert).
const APPLICATION_STATUSES = ['PENDING', 'REVIEWED', 'ACCEPTED', 'DECLINED'] as const

// GET /api/admin/artist-applications — Liste mit optionalem Status-Filter.
export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const statusParam = request.nextUrl.searchParams.get('status')
    const statusFilter = APPLICATION_STATUSES.includes(
      statusParam as (typeof APPLICATION_STATUSES)[number]
    )
      ? (statusParam as (typeof APPLICATION_STATUSES)[number])
      : undefined

    const applications = await prisma.artistApplication.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      include: {
        // Email ist Admin-only sichtbar — Flow braucht sie für die Antwort.
        user: {
          select: { id: true, username: true, displayName: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = applications.map((app) => ({
      ...app,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return adminErrorResponse(error, 'Admin artist applications list error:')
  }
}
