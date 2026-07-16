/**
 * Admin Missions API Route (ADR-039, Workflow: prozesse/kbk-mission-board.md)
 *
 * GET  /api/admin/missions - Alle Missionen auflisten, AUCH ARCHIVED (nur Admin)
 * POST /api/admin/missions - Neue Mission erstellen (nur Admin, createdBy='flow')
 *
 * Blaupause: /api/admin/pools (requireAdmin + zod-safeParse + Slug-Duplikat 409).
 * Boomy legt Missionen über die separate Secret-Route an — hier nur Flow.
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { slugify } from '@/lib/utils'
import { createMissionSchema } from '@/lib/validations'

// GET /api/admin/missions — Liste inkl. ARCHIVED + Acceptance-Zahlen.
// Anders als die Public-Route filtert der Admin NICHT nach Status:
// Archivieren ist der Soft-Delete, Flow muss archivierte Missionen sehen.
export async function GET() {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const missions = await prisma.mission.findMany({
      include: {
        // Nur die Status-Spalte ziehen — reicht für die Zähler, hält die
        // Antwort klein (Admin-Skala, kein Pagination-Bedarf in v1).
        acceptances: { select: { status: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })

    const result = missions.map((mission) => {
      const { acceptances, ...rest } = mission
      return {
        ...rest,
        createdAt: mission.createdAt.toISOString(),
        updatedAt: mission.updatedAt.toISOString(),
        // Acceptance-Zahlen nach Status aufgeschlüsselt (WITHDRAWN bleibt
        // als Audit-Spur in der DB, zählt aber nicht als "aktiv angenommen").
        acceptanceCounts: {
          total: acceptances.length,
          accepted: acceptances.filter((a) => a.status === 'ACCEPTED').length,
          completed: acceptances.filter((a) => a.status === 'COMPLETED').length,
          withdrawn: acceptances.filter((a) => a.status === 'WITHDRAWN').length,
        },
      }
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return adminErrorResponse(error, 'Admin missions list error:')
  }
}

// POST /api/admin/missions — Neue Mission erstellen (Pools-Blaupause).
// createdBy ist reine Attribution ('flow'), NIE aus dem Payload — die
// Autorisierung läuft ausschließlich über requireAdmin().
export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const body = await request.json()
    const parsed = createMissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const slug = slugify(parsed.data.title)
    // Titel ohne slugbare Zeichen (nur Emoji/CJK/Sonderzeichen) → 400 mit
    // maschinenlesbarem Code, statt eine Mission mit leerem Slug anzulegen.
    if (!slug) {
      return NextResponse.json(
        {
          success: false,
          error: 'Title must contain latin characters or digits.',
          code: 'unslugable_title',
        },
        { status: 400 }
      )
    }

    // Slug-Duplikat prüfen (Race-Rest fängt das @unique via P2002 → 409)
    const existing = await prisma.mission.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A mission with this title already exists' },
        { status: 409 }
      )
    }

    const mission = await prisma.mission.create({
      data: {
        ...parsed.data,
        slug,
        createdBy: 'flow',
      },
    })

    return NextResponse.json({ success: true, data: mission }, { status: 201 })
  } catch (error) {
    return adminErrorResponse(error, 'Admin mission create error:')
  }
}
