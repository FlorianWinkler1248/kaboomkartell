// Crowd-Control Server-State — der zustandsbehaftete Radio-Kern.
//
// SERVER-ONLY: importiert prisma. Niemals aus einer Client-Component importieren
// (Boundary — siehe radio-types.ts). Die Slot-Auflösung kommt aus radio.ts
// (prisma-frei), die Wahrscheinlichkeits-Mathematik aus radio-probability.ts (rein).
// Doku + Algorithmus + Fehler-Szenarien: prozesse/kbk-crowd-control.md, ADR-026.
//
// Mechanik (lazy-advance-on-poll, kein Daemon):
//  - RadioHead: genau eine Zeile pro Channel (aktueller decisionSeq + fixer N+1
//    (committedNextTrackId) + eingefrorene N+2-Kandidaten + ggf. gelockter N+2-Gewinner).
//  - RadioPlay: append-only Log; @@unique([channel, decisionSeq]) ist die DB-seitige
//    Doppel-Vorrück-Sperre (zwei gleichzeitige Polls → genau ein create gewinnt).
//  - readNowPlayingState() rückt bei Bedarf vor (Catch-up) und lockt das N+2-Fenster
//    LOCK_LEAD vor Track-Ende. nextTrack = committedNextTrackId (N+1) AB Track-Start.
//
// ADR-033 (18.06.2026 — Track-Lead-Puffer): Gevotet wird das ÜBERNÄCHSTE Lied (N+2). Das
// nächste Lied (N+1) steht beim Start des aktuellen Tracks (N) bereits fest
// (committedNextTrackId, „UP NEXT") und dient als ganzer-Track-Preload-Puffer → behebt
// Stottern/Loop am Track-Start. Beim Advance rotiert der gelockte N+2-Gewinner
// (pendingNextTrackId) zum neuen committedNextTrackId. Bestands-Heads vor ADR-033 haben
// committedNextTrackId=null → advanceFrom löst das selbstheilend auf (Migrationspfad).

import prisma from './db'
import {
  getActiveContext,
  mapPoolTracks,
  type ActiveContext,
  type RadioSlot,
  type RadioEvent,
  type RadioPool,
  type RadioTrack,
  type NowPlayingResult,
} from './radio'
import { computeWeights, pickCandidates, resolveWinner } from './radio-probability'
import type { Candidate, CrowdControlState } from './radio-types'

/** Vote-Fenster (Radio Sync v2): öffnet VOTE_OPEN_DELAY_MS NACH Track-Start,
 *  schließt/lockt VOTE_CLOSE_LEAD_MS VOR Track-Ende. FESTE Werte statt
 *  längen-proportional — der Countdown ist damit für jeden Song konsistent (kein
 *  „Voting schließt 1:15 vor Ende auf langen Tracks" mehr).
 *
 *  VOTE_CLOSE_LEAD_MS MUSS > RADIO_CONFIG.pollIntervalMs (15s) bleiben, damit der
 *  Client den gelockten Gewinner garantiert vor dem Track-Ende erhält (sonst greift
 *  die schedule-getriebene Übergabe ohne nextTrack → kurze Lücke; ADR-026). Dass die
 *  DB-`duration` früher vom echten MP3 abweichen konnte, fängt jetzt der Duration-
 *  Backfill + die server-seitige Upload-Extraktion ab (Conductor-Zeitlinie ist exakt). */
export const VOTE_OPEN_DELAY_MS = 20_000
export const VOTE_CLOSE_LEAD_MS = 20_000
/** Mindest-Voting-Dauer zwischen Öffnen und Schließen. */
export const VOTE_MIN_WINDOW_MS = 10_000
/** Tracks kürzer als open+close+min brauchen kein Community-Voting → Booth-Pick. */
export const MIN_VOTABLE_DURATION_MS = VOTE_OPEN_DELAY_MS + VOTE_CLOSE_LEAD_MS + VOTE_MIN_WINDOW_MS

/** Absoluter Zeitpunkt (ms), ab dem für diese Track-Instanz gevotet werden kann. */
export function windowStartMs(startedAt: Date): number {
  return startedAt.getTime() + VOTE_OPEN_DELAY_MS
}
/** Absoluter Zeitpunkt (ms), an dem das Fenster lockt — geklemmt: nie vor dem
 *  Fenster-Start (kurze Tracks), nie nach Track-Ende. */
export function windowEndMs(startedAt: Date, endsAt: Date): number {
  return Math.max(startedAt.getTime(), endsAt.getTime() - VOTE_CLOSE_LEAD_MS)
}
/** Ist der Track lang genug für ein sinnvolles Community-Vote-Fenster? */
export function isVotableDuration(startedAt: Date, endsAt: Date): boolean {
  return endsAt.getTime() - startedAt.getTime() >= MIN_VOTABLE_DURATION_MS
}
/** Obergrenze für Catch-up-Schritte bei einer Null-Listener-Lücke → sonst Reset. */
const MAX_CATCHUP = 50
/** Wie viele letzte Plays (pool-lokal) die Recency-Berechnung lädt. */
const HISTORY_LOOKBACK = 40
/** RadioPlay-Retention pro Channel (append-only Log nicht unbegrenzt wachsen lassen). */
const RETENTION_PER_CHANNEL = 500

export function isCrowdControlEnabled(): boolean {
  return process.env.RADIO_CROWD_CONTROL !== 'off'
}

/** Re-export, damit Routen den Kontext ohne radio.ts-Direktimport bekommen können. */
export { getActiveContext }
export type { ActiveContext }

/** Lädt Timetable + Pools aus der DB und konvertiert sie ins Radio-Engine-Format.
 *  Die Pool-Track-Filterung (isPublic + LOCAL + duration > 0), das Artist-Display
 *  ("X feat. Y") und die aiDisclosure kommen aus {@link mapPoolTracks} (radio.ts) —
 *  EINE Quelle, geteilt mit der now-playing-Route. */
export async function loadRadioData(now: Date): Promise<{
  radioSlots: RadioSlot[]
  radioEvents: RadioEvent[]
  poolMap: Map<string, RadioPool>
}> {
  const [slots, events, pools] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { isActive: true } }),
    prisma.timetableEvent.findMany({
      where: {
        isActive: true,
        startTime: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
        endTime: { gte: now },
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
                featuringArtist: { select: { username: true, displayName: true } },
                aiDisclosure: true,
              },
            },
          },
        },
      },
    }),
  ])

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
    subgenre: (e as { subgenre?: string | null }).subgenre ?? null,
  }))

  const poolMap = new Map<string, RadioPool>()
  for (const pool of pools) {
    poolMap.set(pool.id, {
      id: pool.id,
      name: pool.name,
      genre: pool.genre,
      tracks: mapPoolTracks(pool.tracks),
    })
  }

  return { radioSlots, radioEvents, poolMap }
}

// ----------------------------------------------------------------------------
// interne Helfer
// ----------------------------------------------------------------------------

type HeadRow = {
  channel: string
  decisionSeq: number
  currentPlayId: string | null
  slotKey: string | null
  // ADR-033: candidateIds sind die Kandidaten fürs N+2-Fenster (übernächstes Lied).
  candidateIds: string
  // ADR-033: fixer N+1 ab Track-Start (UP NEXT). null = Bestands-Head (Migrationspfad in advanceFrom).
  committedNextTrackId: string | null
  // ADR-033: Herkunft des committeten N+1 (VOTE|RANDOM|SEED) → wird beim Advance RadioPlay.source.
  committedSource: string | null
  pendingNextTrackId: string | null
  lockedAt: Date | null
  updatedAt: Date
}

type PlayRow = {
  id: string
  channel: string
  poolId: string
  slotKey: string
  trackId: string
  startedAt: Date
  endsAt: Date
  source: string
  decisionSeq: number
}

function isUniqueError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

/** Stabile Slot-Session-ID: ändert sich bei jedem neuen Slot-Durchlauf, bleibt aber
 *  während eines Durchlaufs konstant. Wird nur zur Slot-Wechsel-Erkennung benutzt —
 *  die Recency ist pool-lokal (poolId), nicht slot-lokal, für maximale Variety. */
function slotKeyOf(ctx: ActiveContext): string {
  return `${ctx.kind}_${ctx.id}_${ctx.effectiveStart.getTime()}`
}

function poolTrackIds(pool: RadioPool): string[] {
  return pool.tracks.map((t) => t.id)
}

function findTrack(pool: RadioPool, trackId: string | null | undefined): RadioTrack | null {
  if (!trackId) return null
  return pool.tracks.find((t) => t.id === trackId) ?? null
}

/** Letzte gespielte trackIds (pool-lokal), INDEX 0 = zuletzt gespielt. */
async function loadRecent(poolId: string): Promise<string[]> {
  const rows = await prisma.radioPlay.findMany({
    where: { poolId },
    orderBy: { startedAt: 'desc' },
    take: HISTORY_LOOKBACK,
    select: { trackId: true },
  })
  return rows.map((r) => r.trackId)
}

function getHead(channel: string): Promise<HeadRow | null> {
  return prisma.radioHead.findUnique({ where: { channel } }) as Promise<HeadRow | null>
}

function getPlay(channel: string, decisionSeq: number): Promise<PlayRow | null> {
  return prisma.radioPlay.findUnique({
    where: { channel_decisionSeq: { channel, decisionSeq } },
  }) as Promise<PlayRow | null>
}

/** Vote-Tally für ein Fenster: trackId → Stimmenzahl. */
async function loadVoteCounts(channel: string, decisionSeq: number): Promise<Record<string, number>> {
  const rows = await prisma.radioVote.findMany({
    where: { channel, decisionSeq },
    select: { candidateTrackId: true },
  })
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.candidateTrackId] = (counts[r.candidateTrackId] ?? 0) + 1
  return counts
}

/** Kandidaten (mit Wahrscheinlichkeit) für ein gegebenes Recency-Bild. */
function buildCandidates(pool: RadioPool, recent: string[], seed: string): { trackId: string; probability: number }[] {
  const weighted = computeWeights(poolTrackIds(pool), recent)
  return pickCandidates(weighted, 5, seed).map((c) => ({ trackId: c.trackId, probability: c.probability }))
}

// ----------------------------------------------------------------------------
// Vorrücken / Initialisieren
// ----------------------------------------------------------------------------

/** Legt für einen frischen Slot (Cold-Start oder Slot-Wechsel) den ersten Play an
 *  und initialisiert den Head. decisionSeq zählt pro Channel monoton weiter. */
async function initSlot(
  ctx: ActiveContext,
  pool: RadioPool,
  now: Date,
  channel: string,
  prevHead: HeadRow | null,
): Promise<{ head: HeadRow; current: PlayRow } | null> {
  const recent = await loadRecent(ctx.poolId)
  const seq = (prevHead?.decisionSeq ?? 0) + 1
  const sk = slotKeyOf(ctx)
  const initSeed = `${sk}_init_${seq}`

  // Erster Track (N): seeded-Pick unter den wahrscheinlichsten (keine Votes beim Start).
  const firstCandidates = buildCandidates(pool, recent, initSeed)
  const firstId = resolveWinner(firstCandidates, {}, initSeed)
  const firstTrack = findTrack(pool, firstId)
  if (!firstTrack) return null

  const startedAt = now
  const endsAt = new Date(now.getTime() + firstTrack.duration * 1000)

  // ADR-033 Kaltstart-Seed: N+1 (committedNextTrackId) wird ebenfalls probabilistisch ohne
  // Votes geseedet — es gibt beim Cold-Start noch keine vorige Vote-Runde. N ist jetzt
  // "zuletzt gespielt" und damit für N+1 gesperrt.
  const committedSeed = `${sk}_committed_${seq}`
  const committedCandidates = buildCandidates(pool, [firstTrack.id, ...recent], committedSeed)
  const committedId = resolveWinner(committedCandidates, {}, committedSeed)
  const committedTrack = findTrack(pool, committedId)
  const committedNextTrackId = committedTrack?.id ?? null
  const committedSource = committedNextTrackId ? 'SEED' : null

  // Kandidaten fürs N+2-Fenster (übernächstes Lied) — Recency schließt N UND N+1 ein, damit
  // das übernächste keinen davon sofort wiederholt. (ADR-033: vorher Kandidaten fürs nächste.)
  const recentForN2 = committedNextTrackId
    ? [committedNextTrackId, firstTrack.id, ...recent]
    : [firstTrack.id, ...recent]
  const n2CandidateIds = buildCandidates(pool, recentForN2, `${sk}_${seq}`).map((c) => c.trackId)

  try {
    const head = await prisma.$transaction(async (tx) => {
      const play = await tx.radioPlay.create({
        data: {
          channel,
          poolId: ctx.poolId,
          slotKey: sk,
          trackId: firstTrack.id,
          startedAt,
          endsAt,
          source: 'SEED',
          decisionSeq: seq,
        },
      })
      return tx.radioHead.upsert({
        where: { channel },
        create: {
          channel,
          decisionSeq: seq,
          currentPlayId: play.id,
          slotKey: sk,
          candidateIds: JSON.stringify(n2CandidateIds),
          committedNextTrackId,
          committedSource,
          pendingNextTrackId: null,
          lockedAt: null,
        },
        update: {
          decisionSeq: seq,
          currentPlayId: play.id,
          slotKey: sk,
          candidateIds: JSON.stringify(n2CandidateIds),
          committedNextTrackId,
          committedSource,
          pendingNextTrackId: null,
          lockedAt: null,
        },
      }) as Promise<HeadRow>
    })
    const current = await getPlay(channel, seq)
    return current ? { head, current } : null
  } catch (e) {
    if (isUniqueError(e)) {
      // Jemand anderes hat parallel initialisiert → frisch lesen.
      const head = await getHead(channel)
      if (head) {
        const current = await getPlay(channel, head.decisionSeq)
        if (current) return { head, current }
      }
      return null
    }
    throw e
  }
}

/** Rückt von einem abgelaufenen Play auf den nächsten vor. Gibt false zurück, wenn
 *  ein paralleler Poll schneller war (P2002) — Aufrufer liest dann frisch nach.
 *
 *  poolMap (optional, Default leer): erlaubt die weiche Übernahme eines bereits
 *  committeten/gelockten Tracks über einen Timetable-Slot-Wechsel hinweg, auch wenn
 *  dessen Pool nicht mehr `pool` (der jetzt aktive Pool) ist — advanceFrom() ist damit
 *  die einzige Fortschreib-Route im laufenden Betrieb (initSlot() bleibt echten
 *  Kaltstart-Fällen vorbehalten, siehe ensureCurrent). Fehlt poolMap oder enthält sie
 *  ending.poolId nicht, verhält sich die Funktion exakt wie zuvor (nur `pool`). */
async function advanceFrom(
  ctx: ActiveContext,
  pool: RadioPool,
  channel: string,
  head: HeadRow,
  ending: PlayRow,
  poolMap: Map<string, RadioPool> = new Map(),
): Promise<boolean> {
  const seq = head.decisionSeq
  const sk = slotKeyOf(ctx)
  const recent = await loadRecent(ctx.poolId)
  const weighted = computeWeights(poolTrackIds(pool), recent)
  const probBy: Record<string, number> = {}
  for (const w of weighted) probBy[w.trackId] = w.probability
  const inPool = new Set(poolTrackIds(pool))

  // Sucht eine trackId zuerst im jetzt aktiven Pool, dann im Pool des endenden Tracks
  // (Slot-Wechsel-Fall) — damit ein bereits committeter/gelockter Track über die
  // Timetable-Grenze hinweg noch auflösbar ist, statt ihn zu verwerfen.
  const endingPool = poolMap.get(ending.poolId) ?? pool
  const findAnywhere = (trackId: string | null | undefined): RadioTrack | null => {
    if (!trackId) return null
    return findTrack(pool, trackId) ?? findTrack(endingPool, trackId)
  }

  // === ADR-033: der neue Play (N+1) ist der bereits FESTSTEHENDE committedNextTrackId. ===
  // Kandidaten + Lock-Gewinner dieses Fensters betreffen das ÜBERNÄCHSTE Lied (N+2) — sie
  // werden NICHT gespielt, sondern zum NEUEN committedNextTrackId rotiert.
  const seed = `${sk}_${seq}`

  // Migrations-/Recovery-Pfad: committedNextTrackId fehlt (Bestands-Head vor ADR-033) ODER ist
  // inzwischen de-publiziert UND auch im Pool des endenden Tracks nicht mehr auffindbar →
  // N+1 selbstheilend über die N+2-Kandidaten auflösen. Quelle der Wahl ist dann das
  // Vote-Fenster dieses seq (so wie es im Alt-Modell der Fall war).
  let committedNextTrackId = head.committedNextTrackId
  let committedSource = head.committedSource
  if (!committedNextTrackId || !findAnywhere(committedNextTrackId)) {
    const frozenForCommitted: string[] = safeParseIds(head.candidateIds)
    let recoveryCands = frozenForCommitted
      .filter((id) => inPool.has(id))
      .map((id) => ({ trackId: id, probability: probBy[id] ?? 0 }))
    if (recoveryCands.length === 0) recoveryCands = buildCandidates(pool, recent, seed)
    const voteCountsForCommitted = await loadVoteCounts(channel, seq)
    const recoveredId = resolveWinner(recoveryCands, voteCountsForCommitted, seed)
    committedNextTrackId = recoveredId
    committedSource = recoveredId
      ? ((voteCountsForCommitted[recoveredId] ?? 0) > 0 ? 'VOTE' : 'RANDOM')
      : null
  }
  // Woher stammt playTrack wirklich? Bei weicher Übernahme (Slot-Wechsel) kann er NUR im
  // Pool des endenden Tracks liegen, nicht im jetzt aktiven `pool` — das MUSS als
  // RadioPlay.poolId geschrieben werden, sonst verliert loadRecent()/readGrace() den
  // Track in seinem eigenen Pool (falscher poolId ≠ trackId-Herkunft, siehe Regression
  // vom 01.07.2026: readNowPlayingState/readGrace fanden den weich übernommenen Track
  // danach nicht mehr wieder, weil sie current.poolId für die Pool-Auflösung nutzen).
  const playTrackInActivePool = findTrack(pool, committedNextTrackId)
  const playTrack = playTrackInActivePool ?? findTrack(endingPool, committedNextTrackId)
  if (!playTrack) return false // defensiv: nichts Sendefähiges → Aufrufer macht initSlot/Retry
  const playTrackPoolId = playTrackInActivePool ? ctx.poolId : ending.poolId

  // Der gerade gelockte N+2-Gewinner wird zum NEUEN committedNextTrackId (das dann-N+1).
  // Kandidaten dieses N+2-Fensters (eingefroren), auf aktuelle Pool-Mitgliedschaft gefiltert.
  const frozenN2: string[] = safeParseIds(head.candidateIds)
  let n2Candidates = frozenN2.filter((id) => inPool.has(id)).map((id) => ({ trackId: id, probability: probBy[id] ?? 0 }))
  if (n2Candidates.length === 0) {
    // Fallback: frische N+2-Kandidaten (z.B. Slot/Pool hat sich stark geändert).
    n2Candidates = buildCandidates(pool, recent, seed)
  }
  const voteCounts = await loadVoteCounts(channel, seq)
  let newCommittedId: string | null
  let newCommittedSource: string | null
  if (head.pendingNextTrackId && findAnywhere(head.pendingNextTrackId)) {
    // Fenster war gelockt → der eingefrorene N+2-Gewinner. Weiche Übernahme: auch wenn der
    // Slot inzwischen gewechselt hat, gilt der demokratisch gelockte Gewinner noch (er wird
    // im dann-N+1 gespielt) — Quelle aus dem Tally ableiten (deckt sich mit dem Lock-
    // Zeitpunkt, da das Fenster seit dem Lock geschlossen ist).
    newCommittedId = head.pendingNextTrackId
    newCommittedSource = (voteCounts[head.pendingNextTrackId] ?? 0) > 0 ? 'VOTE' : 'RANDOM'
  } else {
    // Kein Lock (z.B. Catch-up) → N+2 jetzt auflösen.
    newCommittedId = resolveWinner(n2Candidates, voteCounts, seed)
    newCommittedSource = newCommittedId
      ? ((voteCounts[newCommittedId] ?? 0) > 0 ? 'VOTE' : 'RANDOM')
      : null
  }

  // Kein Sofort-Repeat (ADR-026): newCommitted (das dann-N+1) darf NIE der gerade gespielte
  // Track (playTrack/N+1) sein. Im Migrations-/Catch-up-Pfad (committedNextTrackId==null, kein
  // Lock) lösen Recovery (Z. ~397) und N+2-Auflösung sonst aus identischer Kandidatenliste +
  // Seed + leerem Tally denselben Track auf → ein hörbarer Doppel-Play beim Deploy-Übergang.
  // Bei Mini-Pool (Alternative leer) bleibt der Repeat unvermeidbar (degradiert sauber).
  if (newCommittedId && newCommittedId === playTrack.id) {
    const alt = n2Candidates.filter((c) => c.trackId !== playTrack.id)
    if (alt.length > 0) {
      newCommittedId = resolveWinner(alt, voteCounts, seed)
      newCommittedSource = newCommittedId
        ? ((voteCounts[newCommittedId] ?? 0) > 0 ? 'VOTE' : 'RANDOM')
        : null
    }
  }

  const startedAt = ending.endsAt
  const endsAt = new Date(startedAt.getTime() + playTrack.duration * 1000)
  const nextSeq = seq + 1
  // Kandidaten fürs dann-N+2-Fenster (übernächstes des neuen current = playTrack/N+1).
  // Recency schließt den neuen current (playTrack) UND das neue committed (newCommittedId) ein.
  const recentForNextN2 = newCommittedId
    ? [newCommittedId, playTrack.id, ...recent]
    : [playTrack.id, ...recent]
  const nextN2CandidateIds = buildCandidates(pool, recentForNextN2, `${sk}_${nextSeq}`).map((c) => c.trackId)

  try {
    await prisma.$transaction(async (tx) => {
      const play = await tx.radioPlay.create({
        data: {
          channel,
          poolId: playTrackPoolId,
          slotKey: sk,
          trackId: playTrack.id,
          startedAt,
          endsAt,
          // RadioPlay.source des N+1 = die beim Commit notierte Herkunft (VOTE|RANDOM|SEED).
          source: committedSource ?? 'RANDOM',
          decisionSeq: nextSeq,
        },
      })
      await tx.radioHead.update({
        where: { channel },
        data: {
          decisionSeq: nextSeq,
          currentPlayId: play.id,
          slotKey: sk,
          candidateIds: JSON.stringify(nextN2CandidateIds),
          // committed ← pending: der gevotete N+2 wird zum neuen fixen N+1.
          committedNextTrackId: newCommittedId,
          committedSource: newCommittedSource,
          pendingNextTrackId: null,
          lockedAt: null,
        },
      })
      // Prune: Votes geschlossener Fenster + sehr alte Plays.
      await tx.radioVote.deleteMany({ where: { channel, decisionSeq: { lt: nextSeq } } })
      await tx.radioPlay.deleteMany({
        where: { channel, decisionSeq: { lt: nextSeq - RETENTION_PER_CHANNEL } },
      })
    })
    return true
  } catch (e) {
    if (isUniqueError(e)) return false // paralleler Poll war schneller
    throw e
  }
}

function safeParseIds(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Lockt das laufende N+2-Fenster (friert den N+2-Gewinner als pendingNextTrackId ein),
 *  sobald der feste Vorlauf (VOTE_CLOSE_LEAD_MS) vor Track-Ende erreicht ist und noch nicht
 *  gelockt. Idempotent + nebenläufigkeitssicher über das `lockedAt: null`-Guard im updateMany.
 *
 *  ADR-033: `candidateIds` sind hier die Kandidaten fürs ÜBERNÄCHSTE Lied (N+2). Der Gewinner
 *  wird beim nächsten Advance zum neuen committedNextTrackId rotiert. `committedSource` (die
 *  Herkunft des aktuell committeten N+1) wird hier BEWUSST NICHT überschrieben — sie gehört
 *  zum laufenden N+1, nicht zum pending N+2. Die Source des N+2-Gewinners leitet `advanceFrom`
 *  robust aus demselben Tally ab (Single Source of Truth), sodass kein Wert verloren geht.
 *
 *  Slot-Key kommt aus `current` (dem gerade noch laufenden Play). Die KANDIDATEN des
 *  Fensters kommen dagegen aus `head.candidateIds` — advanceFrom/initSlot haben sie aus dem
 *  zum Advance-Zeitpunkt aktiven Slot-Pool gebaut, die UI zeigt genau diese Liste und die
 *  Votes beziehen sich auf sie. Sie werden hier deshalb NUR auf Auflösbarkeit gefiltert
 *  (de-publizierte Tracks raus), NICHT gegen den Pool des laufenden Plays: nach einer
 *  weichen Slot-Übernahme (ADR-034) trägt `current.poolId` noch den ALTEN Pool, während
 *  die Kandidaten längst aus dem NEUEN stammen — der frühere Filter gegen current.poolId
 *  leerte die Liste, der Fallback baute Alt-Genre-Ersatz und verewigte so das alte Genre
 *  über die Slot-Grenze (Vorfall 16.07.2026: phonk-Channel spielte >10 h lang keinen
 *  Brazilian-Slot-Inhalt, weil jeder Lock die Phonk-Kette verlängerte). */
async function lockWindowIfDue(
  pool: RadioPool,
  channel: string,
  head: HeadRow,
  current: PlayRow,
  now: Date,
  poolMap: Map<string, RadioPool> = new Map(),
): Promise<void> {
  if (head.lockedAt) return
  // Festes Fenster (Radio Sync v2): lockt VOTE_CLOSE_LEAD_MS vor Track-Ende,
  // geklemmt auf >= Fenster-Start (kurze Tracks locken sofort → Booth-Pick).
  if (now.getTime() < windowEndMs(current.startedAt, current.endsAt)) return

  const activePool = poolMap.get(current.poolId) ?? pool
  const seq = head.decisionSeq
  const sk = current.slotKey
  const recent = await loadRecent(current.poolId)
  const weighted = computeWeights(poolTrackIds(activePool), recent)
  const probBy: Record<string, number> = {}
  for (const w of weighted) probBy[w.trackId] = w.probability

  // Kandidaten-Gewichte für den FRISCHEN Slot-Pool (nur nötig, wenn der laufende Play
  // aus einem anderen Pool stammt — weiche Slot-Übernahme). Im Normalbetrieb identisch.
  let freshProbBy: Record<string, number> = probBy
  if (pool.id !== activePool.id) {
    const freshRecent = await loadRecent(pool.id)
    freshProbBy = {}
    for (const w of computeWeights(poolTrackIds(pool), freshRecent)) {
      freshProbBy[w.trackId] = w.probability
    }
  }
  // Auflösbarkeits-Filter statt Einzel-Pool-Filter (siehe Funktions-Kommentar):
  // gültig ist ein Kandidat, wenn er im Fenster-Pool ODER im frischen Slot-Pool sendbar ist.
  const resolvable = (id: string) => findTrack(activePool, id) ?? findTrack(pool, id)
  let candidates = safeParseIds(head.candidateIds)
    .filter((id) => resolvable(id) !== null)
    .map((id) => ({ trackId: id, probability: probBy[id] ?? freshProbBy[id] ?? 0 }))
  // Fallback baut aus dem FRISCHEN Slot-Pool — damit konvergiert die Rotation auch im
  // Degenerat-Fall (alle Kandidaten de-publiziert) zum Genre des aktiven Slots.
  if (candidates.length === 0) {
    const freshRecent = pool.id === activePool.id ? recent : await loadRecent(pool.id)
    candidates = buildCandidates(pool, freshRecent, `${sk}_${seq}`)
  }

  const voteCounts = await loadVoteCounts(channel, seq)
  const winnerId = resolveWinner(candidates, voteCounts, `${sk}_${seq}`)
  if (!winnerId) return

  await prisma.radioHead.updateMany({
    where: { channel, decisionSeq: seq, lockedAt: null },
    data: { pendingNextTrackId: winnerId, lockedAt: now },
  })
}

/** Stellt sicher, dass der Head auf den JETZT laufenden Play zeigt: Cold-Start und
 *  Catch-up (mehrere abgelaufene Tracks) werden hier behandelt.
 *
 *  initSlot() ist auf den echten Kaltstart verengt (kein Head für diesen Channel —
 *  Server-Boot, neuer Channel, oder ein Admin-Reset hat den Head gelöscht). Ein
 *  Timetable-Slot-Wechsel WÄHREND ein Track noch läuft, löst hier bewusst KEINEN Reset
 *  mehr aus: der laufende Track spielt unverändert bis current.endsAt zuende (das war
 *  schon vorher so), und beim tatsächlichen Vorrücken behandelt advanceFrom() einen
 *  Pool-Wechsel als regulären Fall (weiche Übernahme eines bereits committeten/
 *  gelockten Tracks über die Slot-Grenze hinweg) statt eines Voting-Zustands-Wipes. */
async function ensureCurrent(
  ctx: ActiveContext,
  pool: RadioPool,
  now: Date,
  channel: string,
  poolMap: Map<string, RadioPool> = new Map(),
): Promise<{ head: HeadRow; current: PlayRow } | null> {
  let head = await getHead(channel)
  if (!head) {
    return initSlot(ctx, pool, now, channel, null)
  }

  let current = await getPlay(channel, head.decisionSeq)
  if (!current) return initSlot(ctx, pool, now, channel, head)

  let loops = 0
  while (now.getTime() >= current.endsAt.getTime()) {
    if (loops >= MAX_CATCHUP) {
      // Riesen-Lücke (lange Null-Listener-Phase) → 1 Reset statt N Aufroll-Inserts.
      return initSlot(ctx, pool, now, channel, head)
    }
    // Vor dem Vorrücken sicherstellen, dass der Gewinner des endenden Fensters
    // bestimmt ist (bei Catch-up gab es keinen Lock → in advanceFrom aufgelöst).
    await advanceFrom(ctx, pool, channel, head, current, poolMap)
    const fresh = await getHead(channel)
    if (!fresh) return initSlot(ctx, pool, now, channel, null)
    head = fresh
    const next = await getPlay(channel, head.decisionSeq)
    if (!next) return initSlot(ctx, pool, now, channel, head)
    current = next
    loops++
  }

  return { head, current }
}

// ----------------------------------------------------------------------------
// Öffentliche API (von den Routen genutzt)
// ----------------------------------------------------------------------------

/** Der Crowd-Control-Ersatz für getNowPlaying: liest (und treibt) den Head-State.
 *  ctx/pool kommen aus der now-playing-Route (bereits geladen + gefiltert).
 *  Gibt null zurück bei Off-Air → Route fällt auf die normale Off-Air-Antwort. */
export async function readNowPlayingState(
  ctx: ActiveContext | null,
  pool: RadioPool | null,
  now: Date,
  channel: string,
  poolMap: Map<string, RadioPool> = new Map(),
): Promise<NowPlayingResult | null> {
  if (!ctx || !pool || pool.tracks.length === 0) return null

  const ensured = await ensureCurrent(ctx, pool, now, channel, poolMap)
  if (!ensured) return null
  const { head, current } = ensured

  // Fenster ggf. locken (friert Gewinner ein → stabiler nextTrack für den Client).
  await lockWindowIfDue(pool, channel, head, current, now, poolMap)
  const headAfter = (await getHead(channel)) ?? head

  // Der laufende Track kommt aus current.poolId — das kann bei einer weichen Slot-
  // Übernahme (advanceFrom) ein ANDERER Pool sein als der jetzt aktive `pool` (der
  // Sendeplan hat schon gewechselt, der Track spielt aber noch aus dem vorigen Pool
  // zuende). Zuerst gegen den tatsächlichen Herkunfts-Pool auflösen, erst dann gegen
  // den aktiven — sonst würde genau der Track, den dieser Fix eigentlich ungestört
  // weiterlaufen lassen soll, hier plötzlich nicht mehr gefunden (Cutover-Regression).
  const currentPool = poolMap.get(current.poolId) ?? pool
  const track = findTrack(currentPool, current.trackId) ?? findTrack(pool, current.trackId)
  if (!track) return null

  // ADR-033: nextTrack = committedNextTrackId (N+1) AB TRACK-START. N+1 ist der bereits
  // FESTSTEHENDE Gewinner der vorigen Runde — nicht der unsichere Leader eines offenen
  // Fensters (das ist jetzt N+2). Das ist STÄRKER als die alte Lock-Disziplin (Fix
  // 05.06.2026): der Client darf N+1 sofort vorladen → ganzer Track Vorlauf, kein Stottern/
  // Loop am Übergang. Pool-Guard: de-publizierter/null committed → nextTrack = null, der
  // Recovery-Poll (useRadioSync) + der advanceFrom-Migrationspfad fangen das ab. Gleiche
  // weiche-Übernahme-Logik wie beim laufenden Track: committedNextTrackId kann noch aus
  // currentPool stammen (mit current zusammen committet), bevor der neue Pool greift.
  const nextId = headAfter.committedNextTrackId ?? null
  const nextTrack = findTrack(currentPool, nextId) ?? findTrack(pool, nextId)

  const positionSeconds = Math.max(0, (now.getTime() - current.startedAt.getTime()) / 1000)

  return {
    track,
    positionSeconds,
    slot: { id: ctx.id, label: ctx.label, type: ctx.kind, subgenre: ctx.subgenre },
    nextTrack,
    slotEndsAt: ctx.effectiveEnd,
    serverTime: now,
    // Agency-Loop (18.06.2026, ADR-033): Herkunft + Fenster-ID des laufenden Tracks
    // durchreichen, damit der Client „mein Pick läuft" client-seitig erkennen kann.
    // current.source ist VOTE|RANDOM|SEED (RadioPlay-Log), decisionSeq die Fenster-ID.
    currentSource: (current.source as 'VOTE' | 'RANDOM' | 'SEED' | null) ?? null,
    currentDecisionSeq: current.decisionSeq,
  }
}

/** CC-Grace: lässt den laufenden CC-Track über das Slot-Ende hinaus ausspielen
 *  (kein neuer Pick, nextTrack = null), bis er natürlich endet — Pendant zur
 *  deterministischen Grace-Period, aber für den server-gehaltenen Track. Wird von
 *  der now-playing-Route gerufen, wenn kein aktiver Slot mehr da ist. */
export async function readGrace(
  channel: string,
  now: Date,
  pools: Map<string, RadioPool>,
): Promise<NowPlayingResult | null> {
  if (!isCrowdControlEnabled()) return null
  const head = await getHead(channel)
  if (!head) return null
  const current = await getPlay(channel, head.decisionSeq)
  if (!current) return null
  if (now.getTime() >= current.endsAt.getTime()) return null // CC-Track auch vorbei → echtes Off-Air
  const pool = pools.get(current.poolId)
  const track = pool ? findTrack(pool, current.trackId) : null
  if (!track) return null
  return {
    track,
    positionSeconds: Math.max(0, (now.getTime() - current.startedAt.getTime()) / 1000),
    slot: { id: `grace_${channel}`, label: pool?.name ?? 'Radio', type: 'weekly', subgenre: null },
    nextTrack: null,
    slotEndsAt: current.endsAt,
    serverTime: now,
    // Agency-Loop: auch im CC-Grace-Ausspielen die Herkunft/Fenster-ID des laufenden
    // Tracks durchreichen — der Pick könnte exakt jetzt landen (letzter Track des Sets).
    currentSource: (current.source as 'VOTE' | 'RANDOM' | 'SEED' | null) ?? null,
    currentDecisionSeq: current.decisionSeq,
  }
}

/** Liefert den Crowd-Control-Zustand fürs Startseiten-Widget (Kandidaten + Live-Tally
 *  + myVote + Countdown). Treibt den State NICHT (reiner Read; das Vorrücken macht
 *  der now-playing-Poll).
 *
 *  poolMap (optional, Default leer): löst Kandidaten/UP-NEXT gegen den Pool des
 *  tatsächlich laufenden Tracks (current.poolId) auf statt gegen den frisch beim Poll
 *  aufgelösten ctx-Pool — sonst würden Kandidaten/UP-NEXT eines noch offenen Fensters
 *  aus dem VORIGEN Slot beim Poll direkt nach einem Slot-Wechsel fälschlich leer
 *  erscheinen, obwohl der Track (und sein Fenster) noch läuft. */
export async function getCrowdControl(
  ctx: ActiveContext | null,
  pool: RadioPool | null,
  now: Date,
  channel: string,
  userId: string | null,
  poolMap: Map<string, RadioPool> = new Map(),
): Promise<CrowdControlState> {
  const inactive: CrowdControlState = {
    channel,
    decisionSeq: 0,
    candidates: [],
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
  if (!isCrowdControlEnabled() || !ctx || !pool || pool.tracks.length === 0) return inactive

  const head = await getHead(channel)
  if (!head) return inactive
  const current = await getPlay(channel, head.decisionSeq)
  if (!current) return inactive

  const activePool = poolMap.get(current.poolId) ?? pool
  // ADR-033: candidateIds = N+2-Fenster (übernächstes Lied). UP NEXT (N+1) ist committed.
  // Auflösbarkeits-Filter SYMMETRISCH zu lockWindowIfDue (Fix 16.07.2026): nach einer
  // weichen Slot-Übernahme stammen die Kandidaten aus dem NEUEN Pool, der laufende Play
  // aus dem ALTEN — ein Filter nur gegen current.poolId leerte die Liste und das
  // Voting-Widget verschwand für die Dauer des Takeover-Fensters, während der Lock
  // über genau diese (unsichtbaren) Kandidaten entschied. Lock- und Read-Pfad müssen
  // dieselbe Kandidatenmenge sehen.
  const resolveCandidate = (id: string | null | undefined) =>
    id ? (findTrack(activePool, id) ?? findTrack(pool, id)) : null
  const frozen = safeParseIds(head.candidateIds).filter((id) => resolveCandidate(id) !== null)
  const voteCounts = await loadVoteCounts(channel, head.decisionSeq)

  // UP NEXT (N+1) — fixer nächster Track aus committedNextTrackId (Pool-Guard). Fällt bei
  // einer weichen Slot-Übernahme (advanceFrom) auf den ctx-Pool zurück, falls er nicht
  // (mehr) im Pool des laufenden Tracks steckt.
  const upNextTrack = resolveCandidate(head.committedNextTrackId)

  const recent = await loadRecent(current.poolId)
  const probBy: Record<string, number> = {}
  for (const w of computeWeights(poolTrackIds(activePool), recent)) probBy[w.trackId] = w.probability
  // Gewichte für Kandidaten aus dem frischen Slot-Pool (Takeover-Fenster) — analog Lock-Pfad.
  if (pool.id !== activePool.id) {
    const freshRecent = await loadRecent(pool.id)
    for (const w of computeWeights(poolTrackIds(pool), freshRecent)) {
      if (!(w.trackId in probBy)) probBy[w.trackId] = w.probability
    }
  }

  const candidates: Candidate[] = frozen.map((id) => {
    const t = resolveCandidate(id)
    return {
      trackId: id,
      title: t?.title ?? 'Unknown',
      artist: t?.artist ?? '',
      coverUrl: t?.coverUrl ?? null,
      probability: probBy[id] ?? 0,
      votes: voteCounts[id] ?? 0,
    }
  })

  let myVote: string | null = null
  if (userId) {
    const v = await prisma.radioVote.findUnique({
      where: { channel_decisionSeq_userId: { channel, decisionSeq: head.decisionSeq, userId } },
      select: { candidateTrackId: true },
    })
    myVote = v?.candidateTrackId ?? null
  }

  return {
    channel,
    decisionSeq: head.decisionSeq,
    candidates,
    // ADR-033: fixer nächster Track (N+1, „UP NEXT") — steht ab Track-Start fest, kein Vote.
    upNextTrackId: upNextTrack?.id ?? null,
    upNextTitle: upNextTrack?.title ?? null,
    upNextArtist: upNextTrack?.artist ?? null,
    windowStartsAt: new Date(windowStartMs(current.startedAt)).toISOString(),
    windowEndsAt: new Date(windowEndMs(current.startedAt, current.endsAt)).toISOString(),
    locked: head.lockedAt != null,
    myVote,
    // lockedTrackId = der eingefrorene N+2-Gewinner (übernächstes), für „🔒 next" im Widget.
    lockedTrackId: head.pendingNextTrackId ?? null,
    // true, wenn der Sendeplan bereits einen neuen Slot/Pool zeigt, während dieser Track
    // noch aus dem vorigen Pool läuft (weiche Übernahme) — Signal fürs Widget, kurz zu
    // erklären, warum UP NEXT/Kandidaten gleich wechseln, statt es kommentarlos zu tun.
    transitioning: ctx.poolId !== current.poolId,
    // <2 Kandidaten ODER zu kurzer Track → kein sinnvolles Community-Voting (Booth-Pick fürs N+2).
    active: candidates.length >= 2 && isVotableDuration(current.startedAt, current.endsAt),
  }
}

/** Nimmt eine Stimme entgegen (von POST /api/radio/vote, nach Auth + Tier + Rate-Limit).
 *  Validiert Fenster (decisionSeq aktuell, nicht gelockt) + Kandidat. Upsert =
 *  Umentscheiden erlaubt. Liefert HTTP-Status + optionale Fehlermeldung. */
export async function castVote(
  channel: string,
  decisionSeq: number,
  candidateTrackId: string,
  userId: string,
  now: Date = new Date(),
): Promise<{ status: number; error?: string }> {
  if (!isCrowdControlEnabled()) return { status: 409, error: 'Crowd Control is off' }

  const head = await getHead(channel)
  if (!head) return { status: 409, error: 'No active window' }
  if (head.decisionSeq !== decisionSeq) {
    return { status: 409, error: 'Voting window changed — reload' }
  }
  if (head.lockedAt) return { status: 409, error: 'Voting closed for this track' }

  // Radio Sync v2: festes Fenster. Voting öffnet erst VOTE_OPEN_DELAY_MS nach
  // Track-Start; zu kurze Tracks haben gar kein Community-Voting (Booth-Pick).
  const current = await getPlay(channel, decisionSeq)
  if (!current) return { status: 409, error: 'No active window' }
  if (!isVotableDuration(current.startedAt, current.endsAt)) {
    return { status: 409, error: 'This drop is too short to vote — the booth picks' }
  }
  if (now.getTime() < windowStartMs(current.startedAt)) {
    return { status: 409, error: 'Voting opens shortly after the track starts' }
  }

  if (!safeParseIds(head.candidateIds).includes(candidateTrackId)) {
    return { status: 400, error: 'Not a current candidate' }
  }

  await prisma.radioVote.upsert({
    where: { channel_decisionSeq_userId: { channel, decisionSeq, userId } },
    create: { channel, decisionSeq, candidateTrackId, userId },
    update: { candidateTrackId },
  })
  return { status: 200 }
}
