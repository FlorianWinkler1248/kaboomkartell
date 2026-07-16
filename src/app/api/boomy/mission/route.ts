/**
 * Boomy Mission API — Boomy ruft das Rudel (ADR-039)
 *
 * POST /api/boomy/mission
 *   Body: createMissionSchema (title, type, summary, body, ...)
 *
 * Create-ONLY nach wall-post-Blaupause: Rate-Limit (boomyLimit) → Secret
 * (timing-safe via validateBoomySecret) → zod → Slug aus Titel mit
 * Kollisions-Suffix → createdBy fest 'boomy' (der Payload kann das Feld
 * nicht setzen — createdBy ist Attribution, kein Auth-Feld).
 *
 * Boomy legt an, pflegt aber nicht: kein Update, kein Status-Wechsel, kein
 * Fortschritt — Kuratierung bleibt bei Flow (Hausparty-Prinzip,
 * Boomy-Persona-Grenze). Doku: prozesse/kbk-mission-board.md
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { validateBoomySecret } from '@/lib/constants'
import { applyRateLimit, boomyLimit } from '@/lib/rate-limit'
import { createMissionSchema } from '@/lib/validations'
import { slugify } from '@/lib/utils'

export async function POST(request: NextRequest) {
  // Rate-Limit zuerst — Defense-in-Depth zum Secret (Muster wall-post).
  const limited = applyRateLimit(request, boomyLimit, 'boomy-missions', 60)
  if (limited) return limited

  try {
    if (!validateBoomySecret(request.headers.get('Authorization'))) {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body.' },
        { status: 400 }
      )
    }

    const parsed = createMissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const data = parsed.data

    // Slug aus dem Titel; Titel ohne slugbare Zeichen → generischer Stamm.
    const base = slugify(data.title) || 'mission'

    // Kollisions-Suffix: base, base-2, base-3, ... — der Boomy-Dienst darf
    // denselben Titel erneut ausrufen, ohne dass die Queue am 409 haengt.
    let slug = base
    for (let i = 2; i <= 50; i++) {
      const existing = await prisma.mission.findUnique({
        where: { slug },
        select: { id: true },
      })
      if (!existing) break
      slug = `${base}-${i}`
    }

    try {
      const mission = await prisma.mission.create({
        data: {
          slug,
          title: data.title,
          type: data.type,
          summary: data.summary,
          body: data.body,
          actionUrl: data.actionUrl ?? null,
          actionLabel: data.actionLabel ?? null,
          progressCurrent: data.progressCurrent ?? null,
          progressTarget: data.progressTarget ?? null,
          progressUnit: data.progressUnit ?? null,
          acceptable: data.acceptable,
          sortOrder: data.sortOrder,
          // Fest verdrahtet — nie aus dem Payload (Attribution "called by Boomy").
          createdBy: 'boomy',
        },
      })

      return NextResponse.json(
        {
          success: true,
          data: {
            id: mission.id,
            slug: mission.slug,
            title: mission.title,
            status: mission.status,
            createdAt: mission.createdAt,
          },
        },
        { status: 201 }
      )
    } catch (e) {
      // Rest-Race trotz Suffix-Suche (paralleler Doppel-Ausruf): sauberer 409 —
      // der Boomy-Dienst behandelt ihn als "existiert schon" (Queue crasht nicht).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json(
          { success: false, error: 'A mission with this slug already exists.' },
          { status: 409 }
        )
      }
      throw e
    }
  } catch (error) {
    console.error('Boomy mission error:', error)
    return NextResponse.json(
      { success: false, error: 'Error creating mission.' },
      { status: 500 }
    )
  }
}
