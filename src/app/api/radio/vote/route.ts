/**
 * Crowd-Control Vote API
 *
 * POST /api/radio/vote
 *   Body: { channel: "phonk"|"hardtek", decisionSeq: number, candidateTrackId: string }
 *
 * Stimmt im aktuellen Entscheidungs-Fenster für einen der 5 Kandidaten. T1+ (Voten ist
 * ein Trust-Tier-1-Recht), rate-limited, server-validiert (Kandidat ∈ eingefrorene Liste,
 * Fenster offen + aktuell). Upsert = Umentscheiden erlaubt. Doku: prozesse/kbk-crowd-control.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor, requireScope } from '@/lib/agent-auth'
import { requireTier, PermissionError } from '@/lib/permissions'
import { applyRateLimit, radioVoteLimit } from '@/lib/rate-limit'
import { castVote, isCrowdControlEnabled } from '@/lib/radio-state'

const voteSchema = z.object({
  channel: z.enum(['phonk', 'hardtek']),
  decisionSeq: z.number().int().nonnegative(),
  candidateTrackId: z.string().min(1).max(64),
})

export async function POST(request: NextRequest) {
  try {
    if (!isCrowdControlEnabled()) {
      return NextResponse.json({ success: false, error: 'Crowd Control is off right now.' }, { status: 409 })
    }

    // Outer Anti-Flood (vor Auth, schützt auch den Bearer-DB-Lookup): großzügig IP-basiert.
    const ipLimited = applyRateLimit(request, radioVoteLimit, 'radiovote-ip', 120)
    if (ipLimited) return ipLimited

    // Session (Mensch im Browser) ODER Bearer-PAT (Agent) — die eine Brücke (ADR-035 P2).
    const actor = await resolveActor(request)
    if (!actor) {
      return NextResponse.json(
        { success: false, error: 'You must be logged in (or use a valid agent token) to vote.' },
        { status: 401 },
      )
    }
    const userId = actor.userId

    // Bearer-Token braucht den 'vote'-Scope; Session-Actor ('*') passiert immer.
    try {
      requireScope(actor, 'vote')
    } catch (e) {
      if (e instanceof PermissionError) {
        return NextResponse.json(
          { success: false, error: 'This token cannot vote (missing "vote" scope).' },
          { status: 403 },
        )
      }
      throw e
    }

    // Voten bleibt ein T1-Recht (Email verifiziert) — auch für Agenten (unverändert Pflicht).
    try {
      await requireTier(userId, 'T1')
    } catch (e) {
      if (e instanceof PermissionError) {
        return NextResponse.json(
          { success: false, error: 'Verify your email to vote (Trust Tier 1).' },
          { status: 403 },
        )
      }
      throw e
    }

    // Pro-USER-Limit: eine geteilte Agenten-Egress-IP darf nicht Unschuldige mittreffen.
    if (!radioVoteLimit.check(`radiovote-user:${userId}`, 30).success) {
      return NextResponse.json({ success: false, error: 'Too many votes. Slow down.' }, { status: 429 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
    }

    const parsed = voteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { channel, decisionSeq, candidateTrackId } = parsed.data
    const result = await castVote(channel, decisionSeq, candidateTrackId, userId)
    if (result.status !== 200) {
      return NextResponse.json(
        { success: false, error: result.error ?? 'Vote rejected.' },
        { status: result.status },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Radio Vote POST Fehler:', error)
    return NextResponse.json({ success: false, error: 'Failed to register vote.' }, { status: 500 })
  }
}
