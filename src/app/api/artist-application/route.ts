/**
 * Artist-Application API — der Ein-Schuss-Bewerbungsweg (ADR-039)
 *
 * POST /api/artist-application — Bewerbung absenden (T2-Pflicht, 1 pro Account)
 * GET  /api/artist-application — NUR { applied: boolean } (fuer die
 *                                "already applied"-UI)
 *
 * Reihenfolge POST: Rate-Limit (artistApplyLimit, 3/h) → auth() → requireTier T2
 * (PermissionError → 403 code 'tier_required', UI zeigt freundliche Erklaerung
 * + 2FA-Weg) → zod → create (P2002 → 409 'already_applied' — das DB-unique auf
 * userId ist die harte Garantie, kein Read-then-Write) → Mail best effort.
 *
 * Mail-Fehler crasht die Bewerbung NICHT: Record bleibt mit mailSent=false,
 * Antwort ist in BEIDEN Faellen 201 — der Fehlerkanal ist das Admin-Cockpit
 * ("mail failed"-Badge), nicht der User. Die Ziel-Adresse lebt ausschliesslich
 * serverseitig (ENV + Fallback hier) — nie im Client-Bundle, kein mailto:.
 *
 * Doku: prozesse/kbk-artist-onboarding.md
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { auth } from '@/lib/auth'
import { requireTier, PermissionError } from '@/lib/permissions'
import { applyRateLimit, artistApplyLimit } from '@/lib/rate-limit'
import { artistApplicationSchema } from '@/lib/validations'
import { sendMail, buildArtistApplicationEmail } from '@/lib/mailer'
import { ARTIST_APPLICATION_TO_ENV } from '@/lib/mission-config'

export async function POST(request: NextRequest) {
  // Rate-Limit als Allererstes — Defense-in-Depth, die harte "1 pro Account"-
  // Garantie ist das DB-unique, nicht dieses Limit.
  const limited = applyRateLimit(request, artistApplyLimit, 'artist-apply', 3)
  if (limited) return limited

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'You must be logged in to apply.' },
        { status: 401 }
      )
    }
    const userId = session.user.id

    // T2-Gate — Server ist die Autoritaet, Button-Versteckung im Client zaehlt
    // nicht. Code 'tier_required' laesst die UI den freundlichen 2FA-Weg zeigen.
    try {
      await requireTier(userId, 'T2')
    } catch (e) {
      if (e instanceof PermissionError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Full verification (Trust Tier 2) is required to apply as an artist.',
            code: 'tier_required',
          },
          { status: 403 }
        )
      }
      throw e
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

    const parsed = artistApplicationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { message, links } = parsed.data

    // create direkt — KEIN Read-then-Write als Absicherung: bei parallelen
    // POSTs entscheidet das unique, der Verlierer laeuft in P2002.
    let application
    try {
      application = await prisma.artistApplication.create({
        data: {
          userId,
          message,
          // JSON-String (SQLite-Konvention) — Leser parsen defensiv.
          links: links && links.length > 0 ? JSON.stringify(links) : null,
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json(
          {
            success: false,
            error: 'You already applied — one shot per account.',
            code: 'already_applied',
          },
          { status: 409 }
        )
      }
      throw e
    }

    // Mail best effort — Fehler crasht den Request NICHT (mailSent bleibt
    // false, das Cockpit zeigt die Bewerbung trotzdem — kein stiller Verlust).
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      })
      // Ziel-Adresse NUR serverseitig: ENV mit Code-Fallback (ADR-039).
      const to = process.env[ARTIST_APPLICATION_TO_ENV] ?? '4flow@kaboomkartell.com'
      const mail = buildArtistApplicationEmail(
        user?.username ?? 'unknown',
        message,
        links ?? []
      )
      await sendMail({ to, ...mail })
      await prisma.artistApplication.update({
        where: { id: application.id },
        data: { mailSent: true },
      })
    } catch (mailError) {
      console.error('[artist-application] sendMail failed', mailError)
    }

    return NextResponse.json(
      { success: true, data: { status: application.status }, message: 'Application received.' },
      { status: 201 }
    )
  } catch (error) {
    console.error('Artist application error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to submit application.' },
      { status: 500 }
    )
  }
}

// GET — hat der eingeloggte User schon eine Bewerbung? NUR { applied: bool }.
// status/createdAt bleiben bewusst draussen (kbk-artist-onboarding: „kein
// Status-Einblick in v1"), mailSent ebenso: der Fehlerkanal ist das Cockpit,
// nicht der Bewerber (kein Support-Laerm).
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated.' },
        { status: 401 }
      )
    }

    const application = await prisma.artistApplication.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })

    return NextResponse.json({
      success: true,
      data: { applied: application !== null },
    })
  } catch (error) {
    console.error('Artist application status error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load application status.' },
      { status: 500 }
    )
  }
}
