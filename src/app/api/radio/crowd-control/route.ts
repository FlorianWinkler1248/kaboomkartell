/**
 * Crowd-Control API
 *
 * GET /api/radio/crowd-control?channel=phonk|hardtek
 *   — fixes UP NEXT (N+1) + Kandidaten fürs ÜBERNÄCHSTE Lied (N+2, Top-5) + Live-Tally +
 *     myVote + Countdown für das Startseiten-Widget (ADR-033).
 *
 * Eigener, schneller Poll (entkoppelt von der 30s-now-playing-Sync). Reiner Read —
 * das Vorrücken des Head-State macht der now-playing-Poll. Doku: prozesse/kbk-crowd-control.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getActiveContext, getCrowdControl, loadRadioData } from '@/lib/radio-state'
import { RADIO_CHANNELS, type RadioChannel } from '@/lib/radio'
import type { CrowdControlState } from '@/lib/radio-types'

function parseChannel(raw: string | null): RadioChannel | null {
  if (!raw) return null
  const lower = raw.toLowerCase() as RadioChannel
  return (RADIO_CHANNELS as readonly string[]).includes(lower) ? lower : null
}

function inactiveState(channel: string): CrowdControlState {
  return {
    channel,
    decisionSeq: 0,
    candidates: [],
    // ADR-033: fixes UP NEXT (N+1) — off-air/inaktiv → null.
    upNextTrackId: null,
    upNextTitle: null,
    upNextArtist: null,
    windowStartsAt: null,
    windowEndsAt: null,
    locked: false,
    myVote: null,
    lockedTrackId: null,
    transitioning: false,
    active: false,
  }
}

export async function GET(request: NextRequest) {
  try {
    const channel = parseChannel(request.nextUrl.searchParams.get('channel'))
    if (!channel) {
      return NextResponse.json({ success: true, data: inactiveState('') })
    }

    const now = new Date()
    const { radioSlots, radioEvents, poolMap } = await loadRadioData(now)
    const ctx = getActiveContext(radioSlots, radioEvents, poolMap, now, channel)
    const pool = ctx ? poolMap.get(ctx.poolId) ?? null : null

    const session = await auth()
    const userId = session?.user?.id ?? null

    // getCrowdControl behandelt Kill-Switch / Off-Air intern (→ active: false).
    const state = await getCrowdControl(ctx, pool, now, channel, userId, poolMap)
    return NextResponse.json({ success: true, data: state })
  } catch (error) {
    // Defensiv: das Widget soll bei einem Fehler sauber verschwinden (active:false),
    // nicht 500en — Crowd Control ist Zusatz, kein kritischer Pfad.
    console.error('Crowd-Control GET Fehler:', error)
    return NextResponse.json({ success: true, data: inactiveState('') })
  }
}
