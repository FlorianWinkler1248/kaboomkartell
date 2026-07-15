/**
 * Radio Now-Playing API Route
 *
 * GET /api/radio/now-playing[?channel=phonk|hardtek|raggatek]
 *   — Was läuft gerade auf dem gewählten Channel? (Öffentlich)
 *
 * Berechnet anhand des Timetables und der Pool-Tracks deterministisch welcher
 * Track gerade an welcher Position läuft. Kein Server-State nötig — alle
 * Clients berechnen dasselbe Ergebnis.
 *
 * Wenn `channel` gesetzt ist und KEIN Slot dieses Genres aktiv → `data: null`
 * (Sender ist gerade off air). Die Antwort enthält IMMER `activeChannels: []`,
 * damit das Frontend die Pulse-Animation auf den live-sendenden Tabs anzeigen
 * kann, ohne mehrere Requests parallel feuern zu müssen.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  getActiveChannels,
  getNowPlaying,
  getActiveContext,
  mapPoolTracks,
  RADIO_CHANNELS,
  type RadioChannel,
  type RadioSlot,
  type RadioEvent,
  type RadioPool,
  type NowPlayingResult,
} from '@/lib/radio'
import { isCrowdControlEnabled, readNowPlayingState, readGrace } from '@/lib/radio-state'

function parseChannel(raw: string | null): RadioChannel | null {
  if (!raw) return null
  const lower = raw.toLowerCase() as RadioChannel
  return (RADIO_CHANNELS as readonly string[]).includes(lower) ? lower : null
}

// ---------------------------------------------------------------------------
// Radio-Basis-Daten (Slots/Events/Pools) — modul-lokaler Micro-Cache (P0.6/ADR-035).
//
// Diese drei Queries sind global (channel-agnostisch) und ändern sich selten; sie bei
// JEDEM now-playing-Poll frisch zu laden ist die dominante DB-Last des Radios. Cache
// ~8s — deutlich unter LOCK_LEAD (20s), damit der lazy-advance-on-poll-Kern nicht
// verhungert.
//
// Sync-Invariante bleibt gewahrt: der zustandsbehaftete Kern (ensureCurrent →
// getHead/getPlay/advanceFrom, positionSeconds in radio-state.ts) läuft AUSSERHALB
// dieses Loaders und liest RadioHead/RadioPlay PRO REQUEST frisch. getActiveContext
// wendet die frische `now`-Logik ohnehin auf die (leicht) gecachten Events an —
// recurring Events sind zeitunabhängig, abgelaufene filtert getActiveContext heraus.
// Single-Instance-Deployment (systemd) → ein Prozess, ein Cache.
type RadioBaseData = {
  radioSlots: RadioSlot[]
  radioEvents: RadioEvent[]
  poolMap: Map<string, RadioPool>
}
const RADIO_BASE_TTL_MS = 8_000
let radioBaseCache: { data: RadioBaseData; expiresAt: number } | null = null

async function loadRadioBaseData(now: Date): Promise<RadioBaseData> {
  if (radioBaseCache && now.getTime() < radioBaseCache.expiresAt) {
    return radioBaseCache.data
  }

  // Alle aktiven Slots, Events und Pool-Tracks laden
  const [slots, events, pools] = await Promise.all([
    prisma.timetableSlot.findMany({
      where: { isActive: true },
    }),
    prisma.timetableEvent.findMany({
      where: {
        isActive: true,
        // Einmalige Events im 24h-Fenster ODER wiederkehrende (ADR-028 — die
        // haben ein Template-Datum in der Vergangenheit, greifen aber je Woche).
        OR: [
          { recurringDayOfWeek: { not: null } },
          {
            startTime: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
            endTime: { gte: now },
          },
        ],
      },
    }),
    prisma.pool.findMany({
      where: { isActive: true },
      include: {
        tracks: {
          include: {
            track: {
              select: {
                id: true,
                title: true,
                duration: true,
                coverUrl: true,
                isPublic: true,
                trackType: true,
                artist: { select: { username: true, displayName: true } },
                // v2.8: Featuring-Artist mitladen für "4Flow feat. Boomy"-Display.
                featuringArtist: { select: { username: true, displayName: true } },
                // v2.10 02.05.: aiDisclosure für AI-Pill im MiniPlayer.
                aiDisclosure: true,
              },
            },
          },
        },
      },
    }),
  ])

  // In Radio-Engine-Format konvertieren
  const radioSlots: RadioSlot[] = slots.map((s) => ({
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    startHour: s.startHour,
    startMin: s.startMin,
    endHour: s.endHour,
    endMin: s.endMin,
    label: s.label,
    priority: s.priority,
    poolId: s.poolId,
    // v2.26 (07.05.2026): Subgenre-Override (Special-Event)
    subgenre: (s as { subgenre?: string | null }).subgenre ?? null,
  }))

  const radioEvents: RadioEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    startTime: e.startTime,
    endTime: e.endTime,
    eventType: e.eventType,
    poolId: e.poolId,
    streamUrl: e.streamUrl,
    // v2.26 (07.05.2026): Subgenre-Override (Special-Event)
    subgenre: (e as { subgenre?: string | null }).subgenre ?? null,
    // ADR-028: wiederkehrendes Live-Event (null = einmalig).
    recurringDayOfWeek: (e as { recurringDayOfWeek?: number | null }).recurringDayOfWeek ?? null,
  }))

  // Pools in Map konvertieren — Filter/Display/aiDisclosure via mapPoolTracks
  // (radio.ts, EINE Quelle, geteilt mit radio-state.ts). Genre wird mitgenommen,
  // damit die Radio-Engine nach Channel filtern kann.
  const poolMap = new Map<string, RadioPool>()
  for (const pool of pools) {
    poolMap.set(pool.id, {
      id: pool.id,
      name: pool.name,
      genre: pool.genre,
      tracks: mapPoolTracks(pool.tracks),
    })
  }

  const data: RadioBaseData = { radioSlots, radioEvents, poolMap }
  radioBaseCache = { data, expiresAt: now.getTime() + RADIO_BASE_TTL_MS }
  return data
}

export async function GET(request: NextRequest) {
  try {
    const now = new Date()
    const channel = parseChannel(request.nextUrl.searchParams.get('channel'))

    // Radio-Basis-Daten (Slots/Events/Pools) — modul-lokal ~8s gecacht (P0.6/ADR-035),
    // um die dominante DB-Last des now-playing-Polls zu senken. Queries + Mapping sind
    // 1:1 wie zuvor (inkl. recurring-Event-Handling, ADR-028) — nur ausgelagert + gecacht.
    const { radioSlots, radioEvents, poolMap } = await loadRadioBaseData(now)

    // Pulse-Animation im MiniPlayer braucht: welche Channels senden gerade?
    const activeChannels = getActiveChannels(radioSlots, radioEvents, poolMap, now)

    // Crowd Control (ADR-026): bei aktivem Kill-Switch + Channel + POOL-Slot kommt der
    // Track aus dem server-gehaltenen Head-State (probabilistisch + Voting) statt aus der
    // deterministischen Berechnung. Off-Air, Live-Stream-Events und Kill-Switch fallen
    // sauber auf getNowPlaying zurück; der noch laufende CC-Track spielt via readGrace aus.
    // Response-Shape bleibt identisch zum deterministischen Pfad.
    let result: NowPlayingResult | null = null
    if (isCrowdControlEnabled() && channel) {
      try {
        const ctx = getActiveContext(radioSlots, radioEvents, poolMap, now, channel)
        if (ctx) {
          result = await readNowPlayingState(ctx, poolMap.get(ctx.poolId) ?? null, now, channel, poolMap)
        }
        if (!result) {
          result = await readGrace(channel, now, poolMap)
        }
      } catch (ccErr) {
        // Crowd Control darf den Kern-Radio NIE umbringen: bei jedem Fehler (DB-Fehler,
        // fehlende Tabelle, Bug) sauber auf den deterministischen Pfad zurückfallen.
        // Defense-in-Depth zum Kill-Switch.
        console.error('Crowd-Control-Pfad fehlgeschlagen — Fallback auf deterministisch:', ccErr)
        result = null
      }
    }
    if (!result) {
      result = getNowPlaying(radioSlots, radioEvents, poolMap, now, channel)
    }
    const serverTimeIso = now.toISOString()

    if (!result) {
      return NextResponse.json({
        success: true,
        data: null,
        activeChannels,
        serverTime: serverTimeIso,
        channel,
        message: channel
          ? `Channel "${channel}" is off air right now`
          : 'No active slot — schedule has a gap',
      })
    }

    // Conductor-Zeitlinie (Radio Sync v2): absolute Track-Start-/End-Zeitstempel
    // in SERVER-Zeit. Der Client koppelt seine Audio-Position per Clock-Offset
    // exakt daran (PLL), statt nur die relative positionSeconds zu kennen.
    // Mathematisch identisch zur RadioPlay-Row: startedAt = serverTime - position,
    // endsAt = startedAt + duration. (CC-Pfad: startedAt deckt sich exakt mit
    // current.startedAt; deterministischer Pfad: aus elapsed abgeleitet.)
    const trackStartedAt = new Date(result.serverTime.getTime() - result.positionSeconds * 1000)
    const trackEndsAt = new Date(trackStartedAt.getTime() + (result.track?.duration ?? 0) * 1000)

    return NextResponse.json({
      success: true,
      data: {
        track: result.track,
        positionSeconds: Math.round(result.positionSeconds * 100) / 100,
        slot: result.slot,
        nextTrack: result.nextTrack,
        // Absolute Server-Zeitstempel der laufenden Track-Instanz (Conductor-Zeitlinie).
        startedAt: trackStartedAt.toISOString(),
        endsAt: trackEndsAt.toISOString(),
        slotEndsAt: result.slotEndsAt.toISOString(),
        serverTime: result.serverTime.toISOString(),
        eventType: result.eventType,
        streamUrl: result.streamUrl,
        // Agency-Loop (18.06.2026, ADR-033): Herkunft + Fenster-ID des laufenden Tracks
        // für die client-seitige „mein Pick läuft"-Erkennung. Nur der Crowd-Control-Pfad
        // setzt diese; der deterministische getNowPlaying-Pfad lässt sie undefined →
        // hier auf null normalisiert (kein Bruch für bestehende Konsumenten).
        currentSource: result.currentSource ?? null,
        currentDecisionSeq: result.currentDecisionSeq ?? null,
      },
      activeChannels,
      serverTime: serverTimeIso,
      channel,
    })
  } catch (error) {
    console.error('Now-Playing Fehler:', error)
    return NextResponse.json({ success: false, error: 'Interner Fehler' }, { status: 500 })
  }
}
