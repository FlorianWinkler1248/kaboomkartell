/**
 * Player-Queue — die Warteschlangen-Mechanik des Player-Modus (rein, browser-frei).
 *
 * MENTALES MODELL
 * ---------------
 * Eine Warteschlange hat ZWEI Sichten auf dieselben Titel:
 *
 *   - die **Liste** (`tracks` im Hook) — was der Hörer sieht und umsortiert
 *   - die **Reihenfolge** (`order`) — in welcher Folge tatsächlich gespielt wird
 *
 * `order` ist eine Liste von Positionen in die Track-Liste. Ohne Shuffle ist sie
 * `[0,1,2,…]`; mit Shuffle einmal durchmischt. Der `cursor` zeigt auf eine Stelle
 * IN `order`, nicht in die Track-Liste.
 *
 * WARUM DAS WICHTIG IST
 * ---------------------
 * Der frühere Ansatz zog bei Shuffle für jeden Schritt einen neuen Zufallstitel.
 * Damit gab es keine Reihenfolge — und „vorheriger Titel" lieferte im Shuffle
 * einen zufälligen Song statt den, den man gerade gehört hat. Genau daran
 * erkennt man einen halben Player. Eine einmal gemischte Reihenfolge macht
 * Vor- und Zurückspringen symmetrisch und „als Nächstes" überhaupt anzeigbar.
 *
 * Alle Funktionen hier sind pur: gleiche Eingabe → gleiche Ausgabe, kein State,
 * kein DOM. Damit ist die Mechanik ohne Browser testbar (wie das Radio-Regelgesetz
 * in `radio-sync-control.ts`).
 */

import type { RepeatMode } from '@/lib/constants'

export interface QueueState {
  /** Abspiel-Reihenfolge: Positionen in die Track-Liste. */
  order: number[]
  /** Position innerhalb von `order` (NICHT der Track-Index). -1 = nichts gewählt. */
  cursor: number
  shuffle: boolean
  repeat: RepeatMode
}

/** Deterministischer RNG (Mulberry32) — gleicher Seed, gleiche Mischung.
 *  Bewusst kein `Math.random()`: so ist jede Mischung reproduzierbar und testbar. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ungemischte Reihenfolge `[0,1,…,length-1]`. */
export function identityOrder(length: number): number[] {
  return Array.from({ length: Math.max(0, length) }, (_, i) => i)
}

/**
 * Gemischte Reihenfolge (Fisher-Yates mit Seed).
 *
 * `pinFirst` hält einen Track-Index an Position 0 fest. Beim Einschalten von
 * Shuffle mitten im Hören ist das der laufende Titel — er darf nicht wegspringen,
 * nur alles Kommende wird neu gewürfelt.
 */
export function shuffledOrder(length: number, seed: number, pinFirst?: number): number[] {
  const rest = identityOrder(length).filter((i) => i !== pinFirst)
  const rand = mulberry32(seed)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return pinFirst !== undefined && pinFirst >= 0 && pinFirst < length
    ? [pinFirst, ...rest]
    : rest
}

/** Track-Index an der aktuellen Cursor-Position (null, wenn nichts gewählt). */
export function currentTrackIndex(state: QueueState): number | null {
  if (state.cursor < 0 || state.cursor >= state.order.length) return null
  return state.order[state.cursor]
}

/**
 * Nächste Cursor-Position.
 *
 *  - `repeat: 'one'` → dieselbe Stelle (der Titel wiederholt sich)
 *  - sonst eine Stelle weiter
 *  - am Ende: `repeat: 'all'` springt an den Anfang, `off` liefert null (Queue zu Ende)
 */
export function nextCursor(state: QueueState): number | null {
  const n = state.order.length
  if (n === 0) return null
  if (state.cursor < 0) return 0
  if (state.repeat === 'one') return state.cursor
  const next = state.cursor + 1
  if (next < n) return next
  return state.repeat === 'all' ? 0 : null
}

/**
 * Vorherige Cursor-Position.
 *
 * Spiegelbild von `nextCursor` — im Shuffle ist das dank fester Reihenfolge
 * wirklich der zuletzt gehörte Titel. Am Anfang der Queue bleibt der Cursor
 * stehen (statt null), damit „zurück" nie ins Leere läuft; nur `repeat: 'all'`
 * springt ans Ende.
 */
export function prevCursor(state: QueueState): number | null {
  const n = state.order.length
  if (n === 0) return null
  if (state.cursor < 0) return 0
  if (state.repeat === 'one') return state.cursor
  const prev = state.cursor - 1
  if (prev >= 0) return prev
  return state.repeat === 'all' ? n - 1 : 0
}

/** Die nächsten `count` Track-Indizes — speist die „ALS NÄCHSTES"-Anzeige.
 *  `repeat: 'one'` blendet nichts vor: es kommt ja immer derselbe Titel. */
export function upNextIndices(state: QueueState, count: number): number[] {
  const out: number[] = []
  const n = state.order.length
  if (n === 0 || count <= 0) return out
  if (state.repeat === 'one') return out
  // Steht der Cursor noch nirgends (frische Warteschlange), ist KEIN Titel
  // „aktuell" — dann gehören alle n in die Vorschau, nicht nur n-1.
  const maxSteps = state.cursor < 0 ? n : n - 1
  for (let step = 1; step <= maxSteps && out.length < count; step++) {
    const pos = state.cursor + step
    if (pos < n) {
      out.push(state.order[pos])
    } else if (state.repeat === 'all') {
      out.push(state.order[pos % n])
    } else {
      break
    }
  }
  return out
}

/**
 * Shuffle ein-/ausschalten. Der laufende Titel bleibt der laufende Titel —
 * beim Einschalten wird er an den Anfang der neuen Reihenfolge gepinnt, beim
 * Ausschalten findet der Cursor ihn an seiner natürlichen Position wieder.
 */
export function withShuffle(state: QueueState, enabled: boolean, seed: number): QueueState {
  const length = state.order.length
  const playing = currentTrackIndex(state)
  if (enabled) {
    const order = shuffledOrder(length, seed, playing ?? undefined)
    return { ...state, shuffle: true, order, cursor: playing === null ? state.cursor : 0 }
  }
  const order = identityOrder(length)
  return {
    ...state,
    shuffle: false,
    order,
    cursor: playing === null ? state.cursor : order.indexOf(playing),
  }
}

/**
 * Einen Titel aus der Warteschlange entfernen.
 *
 * Zwei Dinge müssen stimmen: alle Positionen hinter dem entfernten Titel rutschen
 * um eins nach vorn, und der Cursor muss weiter auf denselben Titel zeigen wie
 * vorher — sonst springt die Wiedergabe, weil jemand weiter unten in der Liste
 * aufgeräumt hat.
 */
export function withRemovedTrack(state: QueueState, trackIndex: number): QueueState {
  const playing = currentTrackIndex(state)
  const order = state.order
    .filter((i) => i !== trackIndex)
    .map((i) => (i > trackIndex ? i - 1 : i))

  if (playing === null) return { ...state, order, cursor: Math.min(state.cursor, order.length - 1) }

  // Lief der entfernte Titel gerade, rückt die Wiedergabe auf den nachfolgenden.
  if (playing === trackIndex) {
    return { ...state, order, cursor: Math.min(state.cursor, order.length - 1) }
  }
  const shiftedPlaying = playing > trackIndex ? playing - 1 : playing
  return { ...state, order, cursor: order.indexOf(shiftedPlaying) }
}

/**
 * Reihenfolge nach dem Umsortieren der sichtbaren Liste neu aufbauen.
 *
 * `mapping[neuePosition] = altePosition` beschreibt, wohin die Titel gewandert
 * sind. Ohne Shuffle ist die sichtbare Liste die Abspiel-Reihenfolge — mit
 * Shuffle bleibt die gewürfelte Folge erhalten, nur die Indizes zeigen neu.
 */
export function withReorderedTracks(state: QueueState, mapping: number[]): QueueState {
  const oldToNew = new Map<number, number>()
  mapping.forEach((oldIndex, newIndex) => oldToNew.set(oldIndex, newIndex))
  const playing = currentTrackIndex(state)

  if (!state.shuffle) {
    const order = identityOrder(mapping.length)
    const movedPlaying = playing === null ? null : oldToNew.get(playing) ?? null
    return { ...state, order, cursor: movedPlaying === null ? state.cursor : movedPlaying }
  }

  const order = state.order.map((i) => oldToNew.get(i) ?? i)
  const movedPlaying = playing === null ? null : oldToNew.get(playing) ?? playing
  return { ...state, order, cursor: movedPlaying === null ? state.cursor : order.indexOf(movedPlaying) }
}

/** Titel ans Ende anhängen (Reihenfolge wächst hinten mit — auch im Shuffle,
 *  damit „hinzugefügt" nicht heißt „springt sofort dran"). */
export function withAppendedTracks(state: QueueState, addedCount: number): QueueState {
  if (addedCount <= 0) return state
  const start = state.order.length
  const added = Array.from({ length: addedCount }, (_, i) => start + i)
  return { ...state, order: [...state.order, ...added] }
}
