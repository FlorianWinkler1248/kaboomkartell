/**
 * Mission-Accept API — erstes produktives T2-Gate der Plattform (ADR-039)
 *
 * POST   /api/missions/[slug]/accept — Mission annehmen (T2-Pflicht)
 * DELETE /api/missions/[slug]/accept — Annahme widerrufen (status WITHDRAWN)
 *
 * Reihenfolge POST: Rate-Limit (missionLimit, 10/min) → auth() → requireTier T2
 * (PermissionError → 403 mit maschinenlesbarem code TIER_T2_REQUIRED fuer die
 * 2FA-CTA im Client) → Server-Re-Check der Mission (OPEN + acceptable — der
 * Board-Zustand im Browser ist nie die Wahrheit) → Acceptance schreiben.
 *
 * Wieder-Annahme nach WITHDRAWN ist ein UPDATE derselben Zeile — das
 * @@unique(missionId, userId) verbietet eine zweite. Doppel-Accept (auch als
 * Race) laeuft in P2002 → 409, genau EIN Record bleibt (DB-erzwungen).
 *
 * Doku: prozesse/kbk-mission-board.md
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { auth } from '@/lib/auth'
import { requireTier, PermissionError } from '@/lib/permissions'
import { applyRateLimit, missionLimit } from '@/lib/rate-limit'
import { missionAcceptSchema } from '@/lib/validations'

type Params = { params: Promise<{ slug: string }> }

// Identischer 404 fuer unbekannte UND archivierte Slugs (kein Existenz-Orakel).
function missionNotFound(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Mission not found' },
    { status: 404 }
  )
}

export async function POST(request: NextRequest, { params }: Params) {
  // Rate-Limit als Allererstes — eigener Bucket, nicht voteLimit mitverbrauchen.
  const limited = applyRateLimit(request, missionLimit, 'mission-accept', 10)
  if (limited) return limited

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'You must be logged in to accept a mission.' },
        { status: 401 }
      )
    }
    const userId = session.user.id

    // T2-Gate — der Code TIER_T2_REQUIRED ist Vertrag mit der UI (2FA-CTA).
    try {
      await requireTier(userId, 'T2')
    } catch (e) {
      if (e instanceof PermissionError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Enable two-factor authentication (Trust Tier 2) to accept missions.',
            code: 'TIER_T2_REQUIRED',
          },
          { status: 403 }
        )
      }
      throw e
    }

    const parsedParams = missionAcceptSchema.safeParse(await params)
    if (!parsedParams.success) {
      return missionNotFound()
    }
    const { slug } = parsedParams.data

    // Server-Re-Check: existiert + OPEN + acceptable (UI-Zustand zaehlt nicht).
    const mission = await prisma.mission.findUnique({
      where: { slug },
      select: { id: true, status: true, acceptable: true },
    })
    if (!mission || mission.status === 'ARCHIVED') {
      return missionNotFound()
    }
    // Alle 409s tragen maschinenlesbare `code`s — der Client matcht auf code,
    // nie auf englischen Fehlertext (i18n-/Copy-Änderungen brechen sonst Logik).
    if (mission.status !== 'OPEN') {
      return NextResponse.json(
        { success: false, error: 'Mission is not open right now.', code: 'mission_not_open' },
        { status: 409 }
      )
    }
    if (!mission.acceptable) {
      return NextResponse.json(
        { success: false, error: 'This mission cannot be accepted.', code: 'not_acceptable' },
        { status: 409 }
      )
    }

    const existing = await prisma.missionAcceptance.findUnique({
      where: { missionId_userId: { missionId: mission.id, userId } },
      select: { id: true, status: true },
    })

    if (existing) {
      if (existing.status === 'WITHDRAWN') {
        // Wieder-Annahme = Update derselben Zeile (Audit-Spur bleibt).
        const updated = await prisma.missionAcceptance.update({
          where: { id: existing.id },
          data: { status: 'ACCEPTED' },
        })
        return NextResponse.json({ success: true, data: { status: updated.status } })
      }
      // ACCEPTED oder COMPLETED — genau EIN Record pro User+Mission.
      return NextResponse.json(
        { success: false, error: 'Already accepted.', code: 'already_accepted' },
        { status: 409 }
      )
    }

    try {
      const created = await prisma.missionAcceptance.create({
        data: { missionId: mission.id, userId, status: 'ACCEPTED' },
      })
      return NextResponse.json(
        { success: true, data: { status: created.status } },
        { status: 201 }
      )
    } catch (e) {
      // Race (Doppelklick / zwei Tabs): das @@unique entscheidet — der
      // Verlierer bekommt einen sauberen 409, kein generisches 500.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json(
          { success: false, error: 'Already accepted.', code: 'already_accepted' },
          { status: 409 }
        )
      }
      throw e
    }
  } catch (error) {
    console.error('Mission accept error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to accept mission.' },
      { status: 500 }
    )
  }
}

// DELETE — Widerruf der EIGENEN Annahme. Kein T2-Gate: das Gate gilt fuer das
// Annehmen; wer nach der Annahme 2FA deaktiviert hat, darf trotzdem raus.
export async function DELETE(request: NextRequest, { params }: Params) {
  const limited = applyRateLimit(request, missionLimit, 'mission-accept', 10)
  if (limited) return limited

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'You must be logged in to withdraw.' },
        { status: 401 }
      )
    }
    const userId = session.user.id

    const parsedParams = missionAcceptSchema.safeParse(await params)
    if (!parsedParams.success) {
      return missionNotFound()
    }
    const { slug } = parsedParams.data

    // ARCHIVED verhaelt sich auch hier wie unbekannt (kein Existenz-Orakel).
    const mission = await prisma.mission.findUnique({
      where: { slug },
      select: { id: true, status: true },
    })
    if (!mission || mission.status === 'ARCHIVED') {
      return missionNotFound()
    }

    // Lookup strikt auf die Session-userId gescoped — fremde Acceptances
    // sind nie adressierbar.
    const acceptance = await prisma.missionAcceptance.findUnique({
      where: { missionId_userId: { missionId: mission.id, userId } },
      select: { id: true, status: true },
    })
    if (!acceptance || acceptance.status === 'WITHDRAWN') {
      return NextResponse.json(
        { success: false, error: 'No active acceptance found.' },
        { status: 404 }
      )
    }
    if (acceptance.status === 'COMPLETED') {
      // COMPLETED setzt nur Flow (Erfuellungs-Anerkennung) — kein Selbst-Widerruf.
      return NextResponse.json(
        {
          success: false,
          error: 'Completed acceptances cannot be withdrawn.',
          code: 'completed_locked',
        },
        { status: 409 }
      )
    }

    // Status-Update statt Loeschen — die Zeile bleibt als Audit-Spur.
    const updated = await prisma.missionAcceptance.update({
      where: { id: acceptance.id },
      data: { status: 'WITHDRAWN' },
    })

    return NextResponse.json({ success: true, data: { status: updated.status } })
  } catch (error) {
    console.error('Mission withdraw error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to withdraw.' },
      { status: 500 }
    )
  }
}
