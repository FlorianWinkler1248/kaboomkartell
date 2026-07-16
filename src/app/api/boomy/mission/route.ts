/**
 * Boomy Mission API — Boomy ruft das Rudel (ADR-039)
 *
 * POST /api/boomy/mission
 *   Body: createMissionSchema (title, type, summary, body, ...)
 *
 * Create-ONLY nach wall-post-Blaupause: Rate-Limit (boomyLimit) → Secret
 * (timing-safe via validateBoomySecret) → zod → Slug aus Titel → createdBy
 * fest 'boomy' (der Payload kann das Feld nicht setzen — createdBy ist
 * Attribution, kein Auth-Feld).
 *
 * Slug-Kollision → 409 mit code 'slug_exists' — der 409 IST der Queue-Retry-
 * Idempotenz-Schutz (kbk-mission-board B4): der Boomy-Dienst wertet 409 als
 * "existiert schon" und verwirft den Job. KEINE Suffix-Suche (base-2, ...) —
 * die würde jeden Retry zu einer neuen Mission machen statt ihn zu dedupen.
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
import { serializeMissionTranslations } from '@/lib/mission-config'
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

    // Slug aus dem Titel. Titel ohne slugbare Zeichen (z.B. nur Emoji/CJK)
    // → 400 statt generischem Stamm: ein Auto-Slug wie 'mission' wäre nach
    // dem ersten Treffer dauerhaft kollidiert (Idempotenz-Falle).
    const slug = slugify(data.title)
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

    // Kollision → 409 slug_exists (maschinenlesbar, s. Header-Kommentar).
    const existing = await prisma.mission.findUnique({
      where: { slug },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'A mission with this slug already exists.',
          code: 'slug_exists',
        },
        { status: 409 }
      )
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
          // Mission-i18n: optionales Uebersetzungs-OBJEKT im Payload → hier
          // zum JSON-String fuer die DB (leer/fehlend → null, Fallback EN).
          translations: serializeMissionTranslations(data.translations),
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
      // Race hinter dem Read-Check (paralleler Doppel-Ausruf): das @unique
      // entscheidet — sauberer 409 slug_exists, identisch zum Read-Pfad.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json(
          {
            success: false,
            error: 'A mission with this slug already exists.',
            code: 'slug_exists',
          },
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
