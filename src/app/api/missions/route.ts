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

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { applyRateLimit, publicProcessesLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  // Flood-Hygiene wie beim Hilfe-Center (eigener Bucket, geteilter Limiter).
  const limited = applyRateLimit(request, publicProcessesLimit, 'missions-read', 60)
  if (limited) return limited

  try {
    // select statt include: der 20-KB-Markdown-`body` gehoert NICHT in die
    // Board-Liste (Detail-Seite laedt ihn selbst) — spart DB-I/O + Payload.
    const missions = await prisma.mission.findMany({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        type: true,
        summary: true,
        status: true,
        progressCurrent: true,
        progressTarget: true,
        progressUnit: true,
        actionUrl: true,
        actionLabel: true,
        acceptable: true,
        sortOrder: true,
        createdBy: true,
        createdAt: true,
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
