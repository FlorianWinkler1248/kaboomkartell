/**
 * Agency-Picks — client-seitige „Dein Pick läuft"-Erkennung (Agency-Loop, 18.06.2026, ADR-033).
 *
 * WARUM client-seitig: Seit ADR-033 votet die Community das ÜBERNÄCHSTE Lied (N+2), und
 * `RadioVote` wird beim Advance geprunt — der Server hat also KEINE Vote-Historie für den
 * gerade laufenden Track. Die Zuordnung „dieser laufende Track war MEIN Vote" lebt daher
 * rein im localStorage des Browsers, der den Vote selbst ausgelöst hat.
 *
 * MECHANIK (N+2-Versatz): Beim Voten merkt sich der Browser `(channel, decisionSeq, trackId)`.
 * Ein gevoteter Track läuft als `decisionSeq + 2`. Läuft also gerade
 * `playingDecisionSeq` mit `trackId`, ist es mein Pick, wenn ich für das Fenster
 * `playingDecisionSeq − 2` genau diesen `trackId` gevotet habe. Match wird einmalig
 * „verbraucht" markiert → kein Doppel-Toast.
 *
 * CLIENT-SAFE: KEIN prisma/fs/server-Import (reines localStorage + Konstanten). Hart gegen
 * fehlendes/kaputtes localStorage (try/catch) + SSR (typeof window) — ein Privacy-Modus oder
 * voller Speicher darf den Player nie crashen, nur diese Feedback-Schicht still ausfallen.
 *
 * Doku: prozesse/kbk-crowd-control.md (Sektion „Agency-Feedback").
 */

/** N+2-Versatz: ein gevoteter Track (für Fenster `decisionSeq`) läuft als `decisionSeq + 2`. */
export const PICK_OFFSET = 2

/** Wie viele letzte Vote-Fenster pro Channel behalten werden (FIFO, gegen unbegrenztes Wachsen). */
const MAX_PICKS_PER_CHANNEL = 10

/** Ein im Browser gemerkter eigener Vote. */
interface MyPick {
  /** Crowd-Control-Fenster, für das gevotet wurde (= das übernächste Lied). */
  decisionSeq: number
  /** Track, für den gestimmt wurde. */
  trackId: string
  /** true, sobald der Treffer einmal „verbraucht" wurde (Doppel-Toast-Schutz). */
  consumed?: boolean
}

function picksKey(channel: string): string {
  return `kbk_my_picks_${channel}`
}

/** localStorage robust lesen — null bei SSR, fehlendem oder geworfenem Storage. */
function safeGet(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** localStorage robust schreiben — still no-op bei SSR/voll/blockiert. */
function safeSet(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* QuotaExceeded / Privacy-Modus → Feedback-Schicht fällt still aus, Player läuft weiter. */
  }
}

/** Picks eines Channels parsen — immer ein Array, robust gegen kaputtes JSON. */
function readPicks(channel: string): MyPick[] {
  const raw = safeGet(picksKey(channel))
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter(
      (p): p is MyPick =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as MyPick).decisionSeq === 'number' &&
        typeof (p as MyPick).trackId === 'string',
    )
  } catch {
    return []
  }
}

function writePicks(channel: string, picks: MyPick[]): void {
  // Nur die letzten MAX_PICKS_PER_CHANNEL Fenster behalten (FIFO — älteste vorne raus).
  const trimmed = picks.slice(-MAX_PICKS_PER_CHANNEL)
  safeSet(picksKey(channel), JSON.stringify(trimmed))
}

/**
 * Merkt einen erfolgreichen eigenen Vote. `decisionSeq` ist das Fenster, für das gevotet
 * wurde (das übernächste Lied); `trackId` der gewählte Kandidat. Idempotent pro Fenster:
 * ein erneuter Vote im selben Fenster überschreibt den `trackId` (Umentscheiden) und setzt
 * `consumed` zurück.
 */
export function recordMyVote(channel: string, decisionSeq: number, trackId: string): void {
  if (!channel || !trackId || !Number.isFinite(decisionSeq)) return
  const picks = readPicks(channel)
  const existing = picks.find((p) => p.decisionSeq === decisionSeq)
  if (existing) {
    existing.trackId = trackId
    existing.consumed = false
  } else {
    picks.push({ decisionSeq, trackId, consumed: false })
  }
  writePicks(channel, picks)
}

/**
 * Prüft, ob der gerade laufende Track (`playingDecisionSeq` + `trackId`) MEIN Pick ist —
 * also ob ich für das Fenster `playingDecisionSeq − PICK_OFFSET` genau diesen `trackId`
 * gevotet habe und der Treffer noch nicht verbraucht wurde.
 *
 * Bei einem Match wird der Pick als `consumed` markiert (Doppel-Toast-Schutz) und `true`
 * zurückgegeben — der Aufrufer löst dann den Toast aus. Sonst `false`.
 */
export function consumePickIfMatches(
  channel: string,
  playingDecisionSeq: number | null | undefined,
  trackId: string | null | undefined,
): boolean {
  if (!channel || !trackId || playingDecisionSeq == null || !Number.isFinite(playingDecisionSeq)) {
    return false
  }
  const votedSeq = playingDecisionSeq - PICK_OFFSET
  const picks = readPicks(channel)
  const match = picks.find(
    (p) => p.decisionSeq === votedSeq && p.trackId === trackId && !p.consumed,
  )
  if (!match) return false
  match.consumed = true
  writePicks(channel, picks)
  return true
}

// Der frühere Picks-landed-Zähler (kbk_picks_landed, Agency-Loop Teil 3) wurde am
// 16.07.2026 auf Flow-Entscheid entfernt — verunsicherte nur. Der „Your pick is on
// air"-Toast (consumePickIfMatches) bleibt.
