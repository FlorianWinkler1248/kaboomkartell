/**
 * Mission-Board API (public) — ADR-039
 *
 * GET /api/missions — Board-Liste ohne Auth: alle Missionen ausser ARCHIVED
 * (Soft-Delete = Board-unsichtbar), sortiert nach sortOrder. PAUSED/COMPLETED
 * erscheinen mit Status-Badge im Board, OPEN ist der Normalfall.
 *
 * acceptanceCount-Semantik: "N wolves accepted" = ACCEPTED + COMPLETED
 * (erfuellte Annahmen zaehlen weiter), Widerrufe (WITHDRAWN) zaehlen nicht.
 * Sichtbarkeit der Zahl regelt der Client via showVanity (Vanity-Disziplin).
 *
 * Doku: prozesse/kbk-mission-board.md
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  try {
    const missions = await prisma.mission.findMany({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: {
            // Nur echte Annahmen zaehlen — Widerrufe (WITHDRAWN) fallen raus.
            acceptances: { where: { status: { in: ['ACCEPTED', 'COMPLETED'] } } },
          },
        },
      },
    })

    const result = missions.map((m) => ({
      id: m.id,
      slug: m.slug,
      title: m.title,
      type: m.type,
      summary: m.summary,
      status: m.status,
      progressCurrent: m.progressCurrent,
      progressTarget: m.progressTarget,
      progressUnit: m.progressUnit,
      actionUrl: m.actionUrl,
      actionLabel: m.actionLabel,
      acceptable: m.acceptable,
      sortOrder: m.sortOrder,
      createdBy: m.createdBy,
      createdAt: m.createdAt.toISOString(),
      acceptanceCount: m._count.acceptances,
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Missions list error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load missions.' },
      { status: 500 }
    )
  }
}
