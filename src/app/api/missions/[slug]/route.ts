/**
 * Mission-Detail API (public) — ADR-039
 *
 * GET /api/missions/[slug] — Detail einer Mission ohne Auth.
 *
 * ARCHIVED = unsichtbar: archivierte Slugs antworten mit dem IDENTISCHEN 404
 * wie nie existierende (kein Existenz-Orakel, Disziplin aus kbk-help-center).
 *
 * Doku: prozesse/kbk-mission-board.md
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

type Params = { params: Promise<{ slug: string }> }

// Ein Response-Builder fuer beide Faelle (unbekannt + ARCHIVED) —
// garantiert Byte-identische 404-Antworten.
function missionNotFound(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Mission not found' },
    { status: 404 }
  )
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { slug } = await params

    const mission = await prisma.mission.findUnique({
      where: { slug },
      include: {
        _count: {
          select: {
            // Zaehl-Semantik wie Board-Liste: Widerrufe zaehlen nicht.
            acceptances: { where: { status: { in: ['ACCEPTED', 'COMPLETED'] } } },
          },
        },
      },
    })

    if (!mission || mission.status === 'ARCHIVED') {
      return missionNotFound()
    }

    return NextResponse.json({
      success: true,
      data: {
        id: mission.id,
        slug: mission.slug,
        title: mission.title,
        type: mission.type,
        summary: mission.summary,
        // Markdown — Rendering im Client NUR via renderMarkdown
        // (@/lib/process-markdown, Link-Schema-Whitelist).
        body: mission.body,
        status: mission.status,
        progressCurrent: mission.progressCurrent,
        progressTarget: mission.progressTarget,
        progressUnit: mission.progressUnit,
        actionUrl: mission.actionUrl,
        actionLabel: mission.actionLabel,
        acceptable: mission.acceptable,
        sortOrder: mission.sortOrder,
        createdBy: mission.createdBy,
        createdAt: mission.createdAt.toISOString(),
        updatedAt: mission.updatedAt.toISOString(),
        acceptanceCount: mission._count.acceptances,
      },
    })
  } catch (error) {
    console.error('Mission detail error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load mission.' },
      { status: 500 }
    )
  }
}
