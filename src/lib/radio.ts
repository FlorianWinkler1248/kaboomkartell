// Radio-Engine — Deterministisches 24/7 Radio für KBK
// Berechnet anhand von Timetable + Pools was gerade läuft.
// Reines Berechnungsmodul ohne Side-Effects.
//
// Smart-Shuffle-Hook (siehe `./shuffle.ts`): die Funktion `applyShuffleHere`
// am Ende dieser Datei ist der zentrale Einstiegspunkt für die Folge-Session,
// in der der bisherige `seededShuffle` durch `smartShuffle` ersetzt wird
// (Anti-Artist-Repeat + Energy-Arc + BPM-Smoothing). Der Hook ist hier bewusst
// als _Tuer-Steher_ angelegt, damit der Marathon-Subagent F nicht parallel mit
// Subagent B in `radio.ts` kollidiert.

import { GENRE_CHANNEL, genreSubgenre, type Genre } from './constants'

// === Typen ===

export interface RadioTrack {
  id: string
  title: string
  artist: string
  duration: number // Sekunden
  streamUrl: string
  coverUrl?: string | null
  /** v2.10 02.05.: AI-Klassifikation für Player-Pill. */
  aiDisclosure?: 'human' | 'ai_assisted' | 'ai_generated' | null
}

export interface RadioSlot {
  id: string
  dayOfWeek: number // 0=So, 1=Mo ... 6=Sa
  startHour: number
  startMin: number
  endHour: number
  endMin: number
  label: string | null
  priority: number
  poolId: string
  /** v2.26 (07.05.2026): Subgenre-Override für Special-Events.
   *  Werte: "raggatek" (Hardtek), "brazilian-phonk" (Phonk), null = kein Override. */
  subgenre?: string | null
}

export interface RadioEvent {
  id: string
  title: string
  description: string | null
  startTime: Date
  endTime: Date
  eventType: string // 'POOL' | 'YOUTUBE' | 'TWITCH'
  poolId: string | null
  streamUrl: string | null
  /** v2.26 (07.05.2026): Subgenre-Override (analog RadioSlot.subgenre). */
  subgenre?: string | null
  /** 08.06.2026 (ADR-028): null = einmalig (startTime/endTime absolut),
   *  0-6 = wöchentlich an diesem Wochentag (nur die Uhrzeit aus startTime/endTime
   *  gilt, Datum wird ignoriert). */
  recurringDayOfWeek?: number | null
}

export interface RadioPool {
  id: string
  name: string
  /** "Phonk" | "Hardtek" | "Raggatek" — bestimmt den Sender-Channel */
  genre?: string | null
  tracks: RadioTrack[]
}

/** Struktureller Input für {@link mapPoolTracks} — spiegelt die Prisma-Pool-Track-
 *  Selektion (radio-state.ts / now-playing-Route), OHNE Prisma zu importieren.
 *  So bleibt radio.ts client-safe, und die Filter-/Display-Logik lebt an EINER Stelle. */
export interface PoolTrackRow {
  track: {
    id: string
    title: string
    duration: number
    coverUrl?: string | null
    isPublic: boolean
    trackType: string
    artist: { username: string; displayName?: string | null }
    featuringArtist?: { username: string; displayName?: string | null } | null
    // Prisma liefert das Enum als string; die Verengung auf die RadioTrack-Union
    // passiert in mapPoolTracks (die DB-Werte sind auf genau diese Werte beschränkt).
    aiDisclosure?: string | null
  }
}

/** Filtert einen Pool auf sendefähige Tracks (öffentlich + LOCAL + gültige Dauer)
 *  und bringt sie ins RadioTrack-Format inkl. "X feat. Y"-Display + Stream-URL.
 *  EINZIGE Quelle dieser Logik — zuvor 1:1 in radio-state.ts UND der now-playing-
 *  Route dupliziert. Rein berechnend, kein Prisma. */
export function mapPoolTracks(poolTracks: PoolTrackRow[]): RadioTrack[] {
  return poolTracks
    .filter((pt) => pt.track.isPublic && pt.track.trackType === 'LOCAL' && pt.track.duration > 0)
    .map((pt) => {
      const main = pt.track.artist.displayName || pt.track.artist.username
      const feat = pt.track.featuringArtist?.displayName || pt.track.featuringArtist?.username
      return {
        id: pt.track.id,
        title: pt.track.title,
        // v2.8: "4Flow feat. Boomy" wenn Featuring-Artist vorhanden.
        artist: feat ? `${main} feat. ${feat}` : main,
        duration: pt.track.duration,
        streamUrl: `/api/tracks/${pt.track.id}/stream`,
        coverUrl: pt.track.coverUrl ?? null,
        // v2.10 02.05.: aiDisclosure für AI-Pill im MiniPlayer. DB-Enum → RadioTrack-Union.
        aiDisclosure: (pt.track.aiDisclosure as RadioTrack['aiDisclosure']) ?? null,
      }
    })
}

/** Die KBK-Sender-Channels. Phonk (sendet auch Brazilian-Phonk-Pools) und Hardtek
 *  (sendet auch Raggatek-Pools) sind die beiden POOL-Channels — welches Genre auf
 *  welchen geht, sagt GENRE_CHANNEL in lib/constants.ts. Seit 08.06.2026 (ADR-028)
 *  gibt es zusätzlich den LIVE-Channel: er trägt KEINE Pools/Slots, sondern
 *  ausschließlich Live-Stream-Events (Twitch/YouTube, eventType != POOL) und ist
 *  nur dann „on air", wenn gerade so ein Event läuft (kein Crowd Control). Phonk
 *  und Hardtek laufen während eines Live-Events unbeeinflusst parallel weiter. */
export const RADIO_CHANNELS = ['phonk', 'hardtek', 'live'] as const
export type RadioChannel = typeof RADIO_CHANNELS[number]

/** Sonder-Channel für Live-Stream-Events (kein Pool, kein Voting). */
export const LIVE_CHANNEL: RadioChannel = 'live'

/** Alias — die UI-Tabs sind identisch mit den Sender-Channels. */
export const UI_RADIO_CHANNELS = RADIO_CHANNELS
export type UiRadioChannel = typeof UI_RADIO_CHANNELS[number]

/** Mappt ein Pool-Genre auf seinen Radio-Channel. Case-insensitiv;
 *  null, wenn das Genre unbekannt ist. */
function genreChannel(genre: string | null | undefined): RadioChannel | null {
  if (!genre) return null
  const lc = genre.toLowerCase()
  const match = (Object.keys(GENRE_CHANNEL) as Genre[]).find((g) => g.toLowerCase() === lc)
  return match ? GENRE_CHANNEL[match] : null
}

/** Prüft ob ein Pool auf den gegebenen Channel sendet (via Genre→Channel-Mapping). */
function poolMatchesChannel(pool: RadioPool | null | undefined, channel: string): boolean {
  if (!pool?.genre) return false
  return genreChannel(pool.genre) === channel.toLowerCase()
}

/** Channel eines Events (ADR-028): Live-Stream-Events (eventType != POOL) gehen
 *  auf den LIVE-Channel; POOL-Events auf den Genre-Channel ihres Pools. */
function eventChannel(event: RadioEvent, pools: Map<string, RadioPool>): RadioChannel | null {
  if (event.eventType !== 'POOL') return LIVE_CHANNEL
  const pool = event.poolId ? pools.get(event.poolId) : null
  return genreChannel(pool?.genre)
}

/** Prüft ob ein Event auf den gegebenen Channel sendet. */
function eventMatchesChannel(event: RadioEvent, pools: Map<string, RadioPool>, channel: string): boolean {
  return eventChannel(event, pools) === channel.toLowerCase()
}

export interface NowPlayingResult {
  track: RadioTrack | null
  positionSeconds: number
  slot: {
    id: string
    label: string
    type: 'weekly' | 'event'
    /** v2.26 (07.05.2026): Subgenre-Override aus TimetableSlot/TimetableEvent.
     *  Wenn gesetzt, schaltet useChannelAccent auf Special-Event-Theme um. */
    subgenre?: string | null
  }
  nextTrack: RadioTrack | null
  slotEndsAt: Date
  serverTime: Date
  // Für Live-Events
  eventType?: string
  streamUrl?: string
  /** Agency-Loop (18.06.2026, ADR-033): Herkunft des gerade laufenden Tracks
   *  (VOTE|RANDOM|SEED). Nur der Crowd-Control-Pfad setzt das aus dem RadioPlay-Log;
   *  der deterministische Pfad liefert null (keine Vote-Historie). Additiv + optional —
   *  bestehende Konsumenten ignorieren das Feld einfach. */
  currentSource?: 'VOTE' | 'RANDOM' | 'SEED' | null
  /** Agency-Loop: decisionSeq des laufenden Tracks (Crowd-Control-Fenster-ID). Der
   *  Client matcht damit client-seitig „mein Pick läuft" (N+2-Versatz). Deterministischer
   *  Pfad → null. */
  currentDecisionSeq?: number | null
}

export interface UpcomingEntry {
  id: string
  label: string
  startTime: Date
  endTime: Date
  type: 'weekly' | 'event'
  poolName?: string
  genre?: string
  eventType?: string
  isLive: boolean
}

export interface TimetableGap {
  dayOfWeek: number
  startMinutes: number // Minuten seit Mitternacht
  endMinutes: number
  severity: 'warning' | 'critical'
}

// === Deterministischer PRNG (Mulberry32) ===

/** Erzeugt eine Seed-Zahl aus einem String (djb2-Hash) */
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Mulberry32 PRNG — gibt eine Funktion zurück die bei jedem Aufruf eine Zahl zwischen 0-1 liefert */
function mulberry32(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministischer Shuffle — gleicher Seed ergibt immer gleiche Reihenfolge */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  if (items.length <= 1) return [...items]
  const rng = mulberry32(hashString(seed))
  const shuffled = [...items]
  // Fisher-Yates Shuffle mit deterministischem PRNG
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// === Slot-Zeitberechnung ===

/** Wandelt Stunde:Minute in Minuten seit Mitternacht um */
function toMinutes(hour: number, min: number): number {
  return hour * 60 + min
}

/** Berechnet die Dauer eines Slots in Sekunden (berücksichtigt Mitternachts-Übergang) */
function slotDurationSeconds(slot: RadioSlot): number {
  const startMins = toMinutes(slot.startHour, slot.startMin)
  let endMins = toMinutes(slot.endHour, slot.endMin)
  if (endMins <= startMins) {
    // Slot geht über Mitternacht (z.B. 22:00–02:00 = 240 Minuten)
    endMins += 24 * 60
  }
  return (endMins - startMins) * 60
}

/** Berechnet den effektiven Start-Zeitpunkt eines Wochen-Slots für ein gegebenes Datum */
function slotEffectiveStart(slot: RadioSlot, now: Date): Date {
  const today = new Date(now)
  today.setHours(slot.startHour, slot.startMin, 0, 0)

  // Wenn der Slot über Mitternacht geht und wir nach Mitternacht sind,
  // war der effektive Start gestern
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = toMinutes(slot.startHour, slot.startMin)
  const endMinutes = toMinutes(slot.endHour, slot.endMin)

  if (endMinutes <= startMinutes && nowMinutes < endMinutes) {
    // Wir sind im "nächsten Tag"-Teil eines Mitternachts-Slots
    today.setDate(today.getDate() - 1)
  }

  return today
}

/** Berechnet das effektive Ende eines Wochen-Slots */
function slotEffectiveEnd(slot: RadioSlot, now: Date): Date {
  const start = slotEffectiveStart(slot, now)
  const durationMs = slotDurationSeconds(slot) * 1000
  return new Date(start.getTime() + durationMs)
}

/** Prüft ob ein wöchentliches Zeitfenster (Wochentag + Uhrzeit, inkl.
 *  Mitternachts-Übergang) zum Zeitpunkt now aktiv ist. Gemeinsame Basis für
 *  Wochen-Slots UND wiederkehrende Events (ADR-028). Nutzt lokale Zeit (= UTC auf
 *  dem KBK-Server) — konsistent mit der übrigen Engine. */
function isWeeklyWindowActive(
  dayOfWeek: number,
  startMinutes: number,
  endMinutes: number,
  now: Date,
): boolean {
  const nowDay = now.getDay()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  if (endMinutes > startMinutes) {
    // Normales Fenster (z.B. 14:00–16:00)
    return nowDay === dayOfWeek && nowMinutes >= startMinutes && nowMinutes < endMinutes
  }
  // Mitternachts-Fenster (z.B. 22:00–02:00)
  if (nowDay === dayOfWeek && nowMinutes >= startMinutes) return true
  const prevDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  if (nowDay === prevDay && nowMinutes < endMinutes) return true
  return false
}

/** Prüft ob ein Wochen-Slot zum gegebenen Zeitpunkt aktiv ist */
function isSlotActive(slot: RadioSlot, now: Date): boolean {
  return isWeeklyWindowActive(
    slot.dayOfWeek,
    toMinutes(slot.startHour, slot.startMin),
    toMinutes(slot.endHour, slot.endMin),
    now,
  )
}

/** Uhrzeit (Minuten seit Mitternacht) aus einem DateTime. Für wiederkehrende
 *  Events zählt nur die Uhrzeit, nicht das Datum (ADR-028). */
function eventTimeMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** Prüft ob ein Event zum gegebenen Zeitpunkt aktiv ist.
 *  Einmalig (recurringDayOfWeek == null): absolutes Zeitfenster (bisheriges
 *  Verhalten — keine Regression). Wiederkehrend (0-6): Wochentag + Uhrzeit aus
 *  startTime/endTime, analog Wochen-Slot (ADR-028). */
function isEventActive(event: RadioEvent, now: Date): boolean {
  if (event.recurringDayOfWeek == null) {
    return now >= event.startTime && now < event.endTime
  }
  return isWeeklyWindowActive(
    event.recurringDayOfWeek,
    eventTimeMinutes(event.startTime),
    eventTimeMinutes(event.endTime),
    now,
  )
}

/** Effektives Ende eines Events „jetzt": bei einmaligen Events die absolute
 *  endTime, bei wiederkehrenden das heutige Ende (Datum von now + Uhrzeit aus
 *  endTime, inkl. Mitternachts-Übergang). ADR-028. */
function eventEffectiveEnd(event: RadioEvent, now: Date): Date {
  if (event.recurringDayOfWeek == null) return event.endTime
  const startMinutes = eventTimeMinutes(event.startTime)
  const endMinutes = eventTimeMinutes(event.endTime)
  const end = new Date(now)
  end.setHours(event.endTime.getHours(), event.endTime.getMinutes(), 0, 0)
  if (endMinutes <= startMinutes && eventTimeMinutes(now) >= startMinutes) {
    // Mitternachts-Fenster, noch im „Vortag"-Teil → Ende liegt morgen.
    end.setDate(end.getDate() + 1)
  }
  return end
}

// === Hauptfunktionen ===

/** Findet den aktiven Slot oder Event für den gegebenen Zeitpunkt.
 *  Events haben Vorrang vor Wochen-Slots.
 *  Bei mehreren Slots gewinnt die höchste Priorität.
 *
 *  Optional: nur Slots/Events filtern, deren Pool zum gewählten Channel passt
 *  (Phonk/Hardtek/Raggatek). Pools werden für die Genre-Auflösung mitgegeben. */
export function findCurrentSlot(
  slots: RadioSlot[],
  events: RadioEvent[],
  pools: Map<string, RadioPool>,
  now: Date,
  channel?: string | null,
): { type: 'weekly'; slot: RadioSlot } | { type: 'event'; event: RadioEvent } | null {
  // Events haben Vorrang — aber nur auf IHREM Channel (Stream-Events auf LIVE,
  // POOL-Events auf dem Pool-Channel; ADR-028). Ein Stream-Event überschreibt
  // damit NICHT mehr phonk/hardtek — die laufen parallel weiter.
  const activeEvents = events.filter((e) => isEventActive(e, now))
  for (const ev of activeEvents) {
    if (!channel) return { type: 'event', event: ev }
    if (eventMatchesChannel(ev, pools, channel)) return { type: 'event', event: ev }
  }

  // Wochen-Slots nach Priorität sortiert
  let activeSlots = slots.filter((s) => isSlotActive(s, now))
  if (channel) {
    activeSlots = activeSlots.filter((s) => poolMatchesChannel(pools.get(s.poolId), channel))
  }
  activeSlots.sort((a, b) => b.priority - a.priority)

  if (activeSlots.length > 0) {
    return { type: 'weekly', slot: activeSlots[0] }
  }

  return null
}

/** Welche Channels haben gerade einen aktiven Slot/Event? Für UI-Pulse-Animation.
 *  Berücksichtigt auch Grace-Period: ein Channel gilt noch als „live", solange
 *  der letzte Track des gerade beendeten Slots noch ausspielt. */
export function getActiveChannels(
  slots: RadioSlot[],
  events: RadioEvent[],
  pools: Map<string, RadioPool>,
  now: Date,
): RadioChannel[] {
  return RADIO_CHANNELS.filter(
    (c) =>
      findCurrentSlot(slots, events, pools, now, c) !== null ||
      findGracePlayback(slots, events, pools, now, c) !== null,
  )
}

/** Maximales Grace-Fenster nach Slot-Ende (in Sekunden). Begrenzt die Suche
 *  nach „letzter Slot, dessen letzter Track noch läuft" — länger als das
 *  größte realistische Track-Limit (~10 Minuten) brauchen wir nicht.
 *  10 Minuten reicht selbst für seltsam lange Sets/Live-Edits. */
const GRACE_WINDOW_SECONDS = 600

/** Hilfs-Type für Grace-Resultate aus findGracePlayback. */
interface GracePlayback {
  slot: { id: string; label: string; type: 'weekly' | 'event'; subgenre?: string | null }
  pool: RadioPool
  track: RadioTrack
  positionSeconds: number
  trackEndsAt: Date
}

/** Sucht: gab es einen Slot/Event auf diesem Channel, der gerade endete, und dessen
 *  letzter Track noch ausspielt? Kein neuer Slot darf parallel regulär aktiv sein
 *  (sonst gewinnt nach Flows Vorgabe „neuer Song gewinnt nicht — neuer Slot startet
 *  später" der ausspielende Track, aber wenn ein anderer Slot bereits regulär
 *  aktiv ist, hat der natürlich Vorrang). */
function findGracePlayback(
  slots: RadioSlot[],
  events: RadioEvent[],
  pools: Map<string, RadioPool>,
  now: Date,
  channel?: string | null,
): GracePlayback | null {
  // Wenn auf diesem Channel sowieso regulär ein Slot aktiv ist, kein Grace.
  if (findCurrentSlot(slots, events, pools, now, channel) !== null) return null

  // Kandidaten sammeln: Events + Wochen-Slots, deren effektives Ende kürzlich war.
  type Candidate = {
    pool: RadioPool
    effectiveStart: Date
    slotEnd: Date
    label: string
    id: string
    type: 'weekly' | 'event'
    subgenre?: string | null
  }
  const candidates: Candidate[] = []

  for (const ev of events) {
    if (ev.eventType !== 'POOL') continue
    if (!ev.poolId) continue
    const pool = pools.get(ev.poolId)
    if (!pool || pool.tracks.length === 0) continue
    if (channel && !poolMatchesChannel(pool, channel)) continue
    const sinceEnd = (now.getTime() - ev.endTime.getTime()) / 1000
    if (sinceEnd <= 0 || sinceEnd > GRACE_WINDOW_SECONDS) continue
    candidates.push({
      pool,
      effectiveStart: ev.startTime,
      slotEnd: ev.endTime,
      label: ev.title,
      id: ev.id,
      type: 'event',
      subgenre: genreSubgenre(pool.genre),
    })
  }

  for (const s of slots) {
    const pool = pools.get(s.poolId)
    if (!pool || pool.tracks.length === 0) continue
    if (channel && !poolMatchesChannel(pool, channel)) continue
    const start = slotEffectiveStart(s, now)
    const end = slotEffectiveEnd(s, now)
    const sinceEnd = (now.getTime() - end.getTime()) / 1000
    if (sinceEnd <= 0 || sinceEnd > GRACE_WINDOW_SECONDS) continue
    candidates.push({
      pool,
      effectiveStart: start,
      slotEnd: end,
      label: s.label ?? pool.name,
      id: s.id,
      type: 'weekly',
      subgenre: genreSubgenre(pool.genre),
    })
  }

  // Jüngstes Slot-Ende zuerst (am wahrscheinlichsten, dass dessen Track noch läuft).
  candidates.sort((a, b) => b.slotEnd.getTime() - a.slotEnd.getTime())

  for (const cand of candidates) {
    const slotDurationSec = (cand.slotEnd.getTime() - cand.effectiveStart.getTime()) / 1000
    const poolDuration = cand.pool.tracks.reduce((sum, t) => sum + t.duration, 0)
    if (poolDuration === 0) continue
    const loopIndex = Math.max(0, Math.floor(slotDurationSec / poolDuration))
    const positionAtEnd = slotDurationSec % poolDuration
    const seedBase =
      cand.type === 'event'
        ? `${cand.effectiveStart.toISOString().split('T')[0]}_${cand.pool.id}`
        : `${cand.effectiveStart.toISOString().split('T')[0]}_${cand.pool.id}`
    // v2.18: Smart-Shuffle (Anti-Artist-Repeat + Energy-Arc).
    const tracks = applyShuffleHere(cand.pool.tracks, `${seedBase}_loop${loopIndex}`, cand.pool.genre)
    let accumulated = 0
    for (const t of tracks) {
      if (accumulated + t.duration > positionAtEnd) {
        const elapsedInTrackAtSlotEnd = positionAtEnd - accumulated
        const trackEndsAt = new Date(
          cand.slotEnd.getTime() + (t.duration - elapsedInTrackAtSlotEnd) * 1000,
        )
        if (now < trackEndsAt) {
          const elapsedNow = (now.getTime() - cand.effectiveStart.getTime()) / 1000
          const positionSeconds = (elapsedNow % poolDuration) - accumulated
          return {
            slot: { id: cand.id, label: cand.label, type: cand.type, subgenre: cand.subgenre },
            pool: cand.pool,
            track: t,
            positionSeconds: Math.max(0, positionSeconds),
            trackEndsAt,
          }
        }
        // Track bereits vorbei, kein Grace für diesen Kandidaten
        break
      }
      accumulated += t.duration
    }
  }

  return null
}

/** Berechnet was gerade läuft — Track, Position, Slot-Info.
 *  Optional: nur für den gewählten Channel (Phonk/Hardtek/Raggatek).
 *
 *  Grace-Behavior (30.04.2026): wenn der reguläre Slot bereits abgelaufen ist,
 *  aber der letzte Track des Sets noch nicht zuende gespielt hat, wird dieser
 *  Track weiter geliefert — bis er natürlich endet. „Set endet nie davor,
 *  immer nur danach." (Flow's Vorgabe, Brief 30.04.2026). Ein neuer regulärer
 *  Slot, der parallel startet, hat Vorrang vor der Grace-Phase. */
export function getNowPlaying(
  slots: RadioSlot[],
  events: RadioEvent[],
  pools: Map<string, RadioPool>,
  now: Date,
  channel?: string | null,
): NowPlayingResult | null {
  const current = findCurrentSlot(slots, events, pools, now, channel)
  if (!current) {
    // Grace-Phase: letzter Slot vorbei, aber Track noch am laufen?
    const grace = findGracePlayback(slots, events, pools, now, channel)
    if (!grace) return null
    return {
      track: grace.track,
      positionSeconds: grace.positionSeconds,
      slot: grace.slot,
      // nextTrack bewusst null — wir wollen NICHT in den nächsten Loop starten,
      // sondern einfach ausspielen lassen.
      nextTrack: null,
      slotEndsAt: grace.trackEndsAt,
      serverTime: now,
    }
  }

  const serverTime = now

  // Live-Event ohne Pool → nur Stream-URL zurückgeben
  if (current.type === 'event') {
    const event = current.event
    if (event.eventType !== 'POOL') {
      return {
        track: null,
        positionSeconds: 0,
        slot: { id: event.id, label: event.title, type: 'event', subgenre: event.subgenre ?? null },
        nextTrack: null,
        // ADR-028: bei wiederkehrenden Live-Events das HEUTIGE Ende, nicht das
        // Template-Datum aus endTime.
        slotEndsAt: eventEffectiveEnd(event, now),
        serverTime,
        eventType: event.eventType,
        streamUrl: event.streamUrl ?? undefined,
      }
    }

    // POOL-Event: Pool-basierte Berechnung
    const poolId = event.poolId
    if (!poolId) return null
    const pool = pools.get(poolId)
    if (!pool || pool.tracks.length === 0) return null

    const elapsedSeconds = (now.getTime() - event.startTime.getTime()) / 1000
    const slotEndsAt = event.endTime
    const dateSeed = event.startTime.toISOString().split('T')[0]

    return computeTrackPosition(pool, `${dateSeed}_${poolId}`, elapsedSeconds, {
      id: event.id,
      label: event.title,
      type: 'event',
      subgenre: genreSubgenre(pool.genre),
    }, slotEndsAt, serverTime)
  }

  // Wochen-Slot
  const slot = current.slot
  const pool = pools.get(slot.poolId)
  if (!pool || pool.tracks.length === 0) return null

  const effectiveStart = slotEffectiveStart(slot, now)
  const elapsedSeconds = (now.getTime() - effectiveStart.getTime()) / 1000
  const slotEndsAt = slotEffectiveEnd(slot, now)
  const dateSeed = effectiveStart.toISOString().split('T')[0]

  return computeTrackPosition(pool, `${dateSeed}_${pool.id}`, elapsedSeconds, {
    id: slot.id,
    label: slot.label ?? pool.name,
    type: 'weekly',
    subgenre: genreSubgenre(pool.genre),
  }, slotEndsAt, serverTime)
}

/** Aktiver POOL-Kontext eines Channels — für die Crowd-Control-Engine (radio-state.ts).
 *  Kapselt die (sonst nicht exportierte) Slot-/Mitternachts-Zeitlogik, damit der
 *  zustandsbehaftete Pfad sie wiederverwendet statt zu duplizieren. Rein berechnend,
 *  KEIN prisma — radio.ts bleibt client-safe. */
export interface ActiveContext {
  kind: 'weekly' | 'event'
  id: string
  label: string
  subgenre: string | null
  poolId: string
  effectiveStart: Date
  effectiveEnd: Date
}

/** Liefert den aktiven POOL-Slot/-Event eines Channels mit effektiver Start-/End-Zeit,
 *  oder null bei Off-Air bzw. Live-Stream-Event (YOUTUBE/TWITCH — kein Pool, kein CC). */
export function getActiveContext(
  slots: RadioSlot[],
  events: RadioEvent[],
  pools: Map<string, RadioPool>,
  now: Date,
  channel?: string | null,
): ActiveContext | null {
  const current = findCurrentSlot(slots, events, pools, now, channel)
  if (!current) return null

  if (current.type === 'event') {
    const ev = current.event
    if (ev.eventType !== 'POOL' || !ev.poolId) return null
    const pool = pools.get(ev.poolId)
    if (!pool || pool.tracks.length === 0) return null
    return {
      kind: 'event',
      id: ev.id,
      label: ev.title,
      subgenre: genreSubgenre(pool.genre),
      poolId: ev.poolId,
      effectiveStart: ev.startTime,
      effectiveEnd: ev.endTime,
    }
  }

  const slot = current.slot
  const pool = pools.get(slot.poolId)
  if (!pool || pool.tracks.length === 0) return null
  return {
    kind: 'weekly',
    id: slot.id,
    label: slot.label ?? pool.name,
    subgenre: genreSubgenre(pool.genre),
    poolId: slot.poolId,
    effectiveStart: slotEffectiveStart(slot, now),
    effectiveEnd: slotEffectiveEnd(slot, now),
  }
}

/** Berechnet Track + Position innerhalb eines geshuffleten Pools.
 *
 *  Set-Zyklus-Garantien (Flow's Vorgaben):
 *   1. Innerhalb eines Set-Zyklus (= 1 Pool-Durchlauf) wiederholt sich KEIN Track
 *      (Fisher-Yates-Eigenschaft).
 *   2. Über mehrere Zyklen hinweg variiert die Reihenfolge — jeder Loop bekommt
 *      einen eigenen Seed (`${seed}_loop${loopIndex}`), damit man nicht 3× hinter-
 *      einander die identische Track-Folge hört.
 *
 *  Der Übergang zwischen den Loops ist nahtlos: nextTrack zeigt entweder auf den
 *  nächsten Track im aktuellen Loop oder — wenn wir am Loop-Ende stehen — auf den
 *  ersten Track des nächsten (anders permutierten) Loops. */
function computeTrackPosition(
  pool: RadioPool,
  seed: string,
  elapsedSeconds: number,
  slotInfo: { id: string; label: string; type: 'weekly' | 'event'; subgenre?: string | null },
  slotEndsAt: Date,
  serverTime: Date
): NowPlayingResult {
  const baseDuration = pool.tracks.reduce((sum, t) => sum + t.duration, 0)

  if (baseDuration === 0 || pool.tracks.length === 0) {
    return {
      track: pool.tracks[0] ?? null,
      positionSeconds: 0,
      slot: slotInfo,
      nextTrack: pool.tracks[1] ?? null,
      slotEndsAt,
      serverTime,
    }
  }

  // In welchem Pool-Durchlauf sind wir? 0 = erster Durchlauf, 1 = zweiter, ...
  const loopIndex = Math.max(0, Math.floor(elapsedSeconds / baseDuration))
  const positionInLoop = elapsedSeconds % baseDuration

  // v2.18: Smart-Shuffle (Anti-Artist-Repeat + Energy-Arc, deterministisch
  // pro Loop). Channel-Genre fliesst in den Seed → 2 gleichzeitig startende
  // Slots auf verschiedenen Channels bekommen verschiedene Permutationen.
  const tracks = applyShuffleHere(pool.tracks, `${seed}_loop${loopIndex}`, pool.genre)

  let accumulated = 0
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    if (accumulated + track.duration > positionInLoop) {
      let nextTrack: RadioTrack
      if (i + 1 < tracks.length) {
        nextTrack = tracks[i + 1]
      } else {
        // Letzter Track in diesem Loop → nextTrack ist der erste Track des
        // nächsten (anders permutierten) Loops.
        const nextLoop = applyShuffleHere(pool.tracks, `${seed}_loop${loopIndex + 1}`, pool.genre)
        nextTrack = nextLoop[0]
      }
      return {
        track,
        positionSeconds: positionInLoop - accumulated,
        slot: slotInfo,
        nextTrack,
        slotEndsAt,
        serverTime,
      }
    }
    accumulated += track.duration
  }

  // Fallback (durch Modulo nicht erreichbar, defensiv)
  return {
    track: tracks[0],
    positionSeconds: 0,
    slot: slotInfo,
    nextTrack: tracks[1] ?? null,
    slotEndsAt,
    serverTime,
  }
}

/** Gibt die nächsten Einträge im Programm zurück (für Timetable-Preview) */
export function getUpcoming(
  slots: RadioSlot[],
  events: RadioEvent[],
  pools: Map<string, RadioPool>,
  now: Date,
  hours: number = 24
): UpcomingEntry[] {
  const endTime = new Date(now.getTime() + hours * 60 * 60 * 1000)
  const entries: UpcomingEntry[] = []

  // Einmalige Events im Zeitfenster sammeln (wiederkehrende werden unten je
  // Wochentag expandiert — ADR-028).
  for (const event of events) {
    if (event.recurringDayOfWeek != null) continue
    if (event.startTime < endTime && event.endTime > now) {
      const pool = event.poolId ? pools.get(event.poolId) : null
      entries.push({
        id: event.id,
        label: event.title,
        startTime: event.startTime < now ? now : event.startTime,
        endTime: event.endTime,
        type: 'event',
        poolName: pool?.name,
        eventType: event.eventType,
        isLive: event.eventType !== 'POOL',
      })
    }
  }

  // Wochen-Slots für die nächsten Stunden auflösen
  const cursor = new Date(now)
  cursor.setMinutes(0, 0, 0)

  while (cursor < endTime) {
    const dayOfWeek = cursor.getDay()

    // Wiederkehrende Events dieses Wochentags expandieren (ADR-028) — VOR den
    // Slots, damit die Override-Prüfung der Slots wiederkehrende POOL-Events sieht.
    for (const event of events) {
      if (event.recurringDayOfWeek !== dayOfWeek) continue
      const evStart = new Date(cursor)
      evStart.setHours(event.startTime.getHours(), event.startTime.getMinutes(), 0, 0)
      const startMin = eventTimeMinutes(event.startTime)
      const endMin = eventTimeMinutes(event.endTime)
      let durationMin = endMin - startMin
      if (durationMin <= 0) durationMin += 24 * 60 // Mitternachts-Übergang
      const evEnd = new Date(evStart.getTime() + durationMin * 60 * 1000)
      if (evEnd > now && evStart < endTime) {
        const pool = event.poolId ? pools.get(event.poolId) : null
        entries.push({
          id: event.id,
          label: event.title,
          startTime: evStart < now ? now : evStart,
          endTime: evEnd,
          type: 'event',
          poolName: pool?.name,
          eventType: event.eventType,
          isLive: event.eventType !== 'POOL',
        })
      }
    }

    for (const slot of slots) {
      if (slot.dayOfWeek !== dayOfWeek) continue

      const slotStart = new Date(cursor)
      slotStart.setHours(slot.startHour, slot.startMin, 0, 0)

      const durationMs = slotDurationSeconds(slot) * 1000
      const slotEnd = new Date(slotStart.getTime() + durationMs)

      // Nur Slots die ins Zeitfenster fallen und nicht in der Vergangenheit liegen
      if (slotEnd > now && slotStart < endTime) {
        // Prüfen ob ein POOL-Event diesen Slot überschreibt. Live-Stream-Events
        // (LIVE-Channel) laufen PARALLEL und verdrängen die Slots NICHT (ADR-028).
        const overridden = entries.some(
          (e) => e.type === 'event' && !e.isLive && e.startTime < slotEnd && e.endTime > slotStart
        )
        if (overridden) continue

        const pool = pools.get(slot.poolId)
        entries.push({
          id: slot.id,
          label: slot.label ?? pool?.name ?? 'Rotation',
          startTime: slotStart < now ? now : slotStart,
          endTime: slotEnd,
          type: 'weekly',
          poolName: pool?.name,
          isLive: false,
        })
      }
    }
    // Nächsten Tag prüfen
    cursor.setDate(cursor.getDate() + 1)
    cursor.setHours(0, 0, 0, 0)
  }

  // Nach Startzeit sortieren
  entries.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  return entries
}

/** Findet Lücken im Wochenplan (Zeiten ohne aktiven Slot) */
export function findGaps(slots: RadioSlot[]): TimetableGap[] {
  const gaps: TimetableGap[] = []
  const MINUTES_PER_DAY = 24 * 60

  for (let day = 0; day < 7; day++) {
    // Alle Slots für diesen Tag sammeln (inklusive Mitternachts-Überlauf vom Vortag)
    const daySlots: { start: number; end: number }[] = []

    for (const slot of slots) {
      const start = toMinutes(slot.startHour, slot.startMin)
      const end = toMinutes(slot.endHour, slot.endMin)

      if (slot.dayOfWeek === day) {
        if (end <= start) {
          // Slot geht über Mitternacht — für heute nur bis Mitternacht
          daySlots.push({ start, end: MINUTES_PER_DAY })
        } else {
          daySlots.push({ start, end })
        }
      }

      // Mitternachts-Überlauf vom Vortag prüfen
      const prevDay = day === 0 ? 6 : day - 1
      if (slot.dayOfWeek === prevDay && end <= start) {
        // Dieser Slot startete gestern und läuft bis heute Morgen
        daySlots.push({ start: 0, end })
      }
    }

    // Nach Startzeit sortieren
    daySlots.sort((a, b) => a.start - b.start)

    // Lücken finden
    let cursor = 0
    for (const segment of daySlots) {
      if (segment.start > cursor) {
        gaps.push({
          dayOfWeek: day,
          startMinutes: cursor,
          endMinutes: segment.start,
          severity: 'warning', // Wird vom Aufrufer auf 'critical' gesetzt wenn nötig
        })
      }
      cursor = Math.max(cursor, segment.end)
    }

    // Rest des Tages prüfen
    if (cursor < MINUTES_PER_DAY) {
      gaps.push({
        dayOfWeek: day,
        startMinutes: cursor,
        endMinutes: MINUTES_PER_DAY,
        severity: 'warning',
      })
    }
  }

  return gaps
}

// === Smart-Shuffle-Hook (Marathon 02.05.2026, Subagent F) ===
//
// Der Hook ersetzt aktuell NICHTS in der Engine — er ist der Einstiegspunkt für
// die Folge-Session. Schritte für die Integration:
//   1. In `computeTrackPosition` und `findGracePlayback` die `seededShuffle(...)`-
//      Aufrufe ersetzen durch `applyShuffleHere(pool.tracks, seedString, channel)`.
//   2. `seededShuffle` (oben in dieser Datei) deprecaten und entfernen, sobald
//      keine Aufrufer mehr existieren.
//   3. Tests in `__tests__/shuffle.test.ts` mit `pnpm add -D vitest` lauffaehig
//      machen (Permission von Flow einholen).
import { smartShuffle, hashSeed } from './shuffle'

/** Anwendungs-Shim: nimmt das gleiche Track-Format wie die alte `seededShuffle`
 *  und liefert eine smart-geshuffelte Reihenfolge. Channel-Hash fliesst in den
 *  Seed ein, damit zwei gleichzeitig startende Slots auf verschiedenen Channels
 *  verschiedene Permutationen bekommen. */
export function applyShuffleHere(
  tracks: RadioTrack[],
  seedString: string,
  channel?: string | null,
): RadioTrack[] {
  const seed = hashSeed(channel ? `${seedString}_${channel}` : seedString)
  return smartShuffle(
    tracks.map((t) => ({
      id: t.id,
      // RadioTrack hat keinen artistId, nur artist (String). Für Anti-Repeat
      // reicht der Artist-Name als Identität — kollidiert nur, wenn 2 Artists
      // den exakt gleichen Display-Namen tragen, was wir akzeptieren.
      artistId: t.artist,
      // RadioTrack-Duration ist in Sekunden, smartShuffle erwartet Millisekunden.
      durationMs: t.duration * 1000,
      // bpm ist in RadioTrack nicht enthalten — Aufrufer kann das später
      // anreichern, wenn er Pool-Tracks aus dem DB-Modell lädt.
    })),
    { seed },
  ).map((shuffled) => tracks.find((t) => t.id === shuffled.id)!)
}
