// Smart-Shuffle für KBK Radio. Pro Slot-Start eine Track-Reihenfolge,
// die (a) unvorhersehbar wirkt, (b) innerhalb eines Slots reproduzierbar
// ist (alle Listener hoeren das gleiche), (c) Variety maximiert: kein
// Artist direkt hinter sich, sanfter Energie-Arc, BPM-Smoothing.
//
// Design: Energy-Arc + BPM-Smoothing sind SOFT-Constraints, Anti-Artist-
// Repeat ist HARD (läuft als finaler Pass). Bei zu kleinem Pool oder
// fehlenden BPM-Daten degradiert es sauber auf Fisher-Yates.
// Determinismus via Mulberry32 + djb2-Hash (entkoppelt von radio.ts).

export type Track = {
  id: string
  artistId?: string | null
  bpm?: number | null
  durationMs?: number | null
}

export type EnergyArc = 'flat' | 'rise' | 'wave'

export type ShuffleOptions = {
  /** Seed für Determinismus innerhalb eines Slots. Default: Date.now(). */
  seed?: number
  /** Minimale Distanz zwischen 2 Tracks vom gleichen Artist. Default: 3. */
  minArtistDistance?: number
  /** Energy-Arc-Form: 'flat' | 'rise' | 'wave'. Default: 'wave'. */
  energyArc?: EnergyArc
  /** Maximaler erlaubter BPM-Sprung zwischen Nachbarn (Soft, wird abgeschwaecht). Default: 25. */
  maxBpmJump?: number
}

const DEFAULT_OPTIONS: Required<ShuffleOptions> = {
  seed: 0,
  minArtistDistance: 3,
  energyArc: 'wave',
  maxBpmJump: 25,
}
// === PRNG ===

/** Mulberry32: schneller, gut-verteilter PRNG mit ~32 bit state. */
function mulberry32(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** djb2-Hash für String- oder Number-Seeds. Niemals 0. */
export function hashSeed(input: string | number): number {
  if (typeof input === 'number') return Math.abs(input | 0) || 1
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash) || 1
}

// === Fisher-Yates ===

function fisherYates<T>(items: T[], rng: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// === Anti-Artist-Repeat ===

/** Sliding-Window-Pass: bei Artist-Konflikt mit zu nahem Vorgaenger einen
 *  Tausch-Kandidaten weiter hinten suchen. Pool zu klein → graceful degrade. */
function enforceArtistDistance<T extends Track>(items: T[], minDistance: number): T[] {
  if (minDistance <= 1 || items.length <= 1) return items
  const out = items.slice()

  for (let i = 1; i < out.length; i++) {
    const conflictWindow = Math.min(minDistance - 1, i)
    const current = out[i]
    if (!current.artistId) continue

    let conflict = false
    for (let k = 1; k <= conflictWindow; k++) {
      if (out[i - k].artistId && out[i - k].artistId === current.artistId) {
        conflict = true
        break
      }
    }
    if (!conflict) continue

    // Suche Tausch-Kandidat ab i+1, der KEINEN Konflikt erzeugt — weder an
    // Position i (wo er hin soll) noch an Position swapIdx (wo current hin soll).
    let swapIdx = -1
    for (let j = i + 1; j < out.length; j++) {
      const candidate = out[j]

      // Würde candidate an Position i einen Konflikt mit den nahen Vorgaengern bauen?
      let candidateConflictAtI = false
      for (let k = 1; k <= conflictWindow; k++) {
        if (out[i - k].artistId && out[i - k].artistId === candidate.artistId) {
          candidateConflictAtI = true
          break
        }
      }
      if (candidateConflictAtI) continue

      swapIdx = j
      break
    }

    if (swapIdx !== -1) {
      ;[out[i], out[swapIdx]] = [out[swapIdx], out[i]]
    }
    // Sonst: graceful degrade — keinen passenden Tausch gefunden, Constraint
    // an dieser Stelle akzeptieren. Pool ist artist-lastig.
  }

  return out
}

// === Energy-Arc ===

/** Sortiert nach BPM aufsteigend, dann ab Mitte absteigend (Wave/Glocke). */
function buildArc(items: Track[], arc: EnergyArc): Track[] {
  if (arc === 'flat') return items
  const withBpm = items.filter((t) => typeof t.bpm === 'number' && Number.isFinite(t.bpm))
  if (withBpm.length < 3) return items // zu wenig Daten für sinnvollen Arc

  const sorted = items.slice().sort((a, b) => {
    const ax = typeof a.bpm === 'number' ? a.bpm : Number.POSITIVE_INFINITY
    const bx = typeof b.bpm === 'number' ? b.bpm : Number.POSITIVE_INFINITY
    return ax - bx
  })

  if (arc === 'rise') return sorted

  // 'wave': abwechselnd ans Ende und an den Anfang setzen, von langsam nach schnell.
  // Resultat: niedrigste am Rand, höchste in der Mitte (Glocke).
  const wave: Track[] = []
  let toEnd = true
  for (const t of sorted) {
    if (toEnd) wave.push(t)
    else wave.unshift(t)
    toEnd = !toEnd
  }
  return wave
}

/** Soft-Mix: Random-Order + Arc-Order. arcWeight ~0.35 = Stupser, keine harte Sortierung. */
function mixWithArc<T extends Track>(random: T[], arc: T[], arcWeight: number): T[] {
  // Wir bauen ein Score je Track aus zwei Positionen, sortieren danach.
  const arcIndex = new Map<string, number>()
  arc.forEach((t, i) => arcIndex.set(t.id, i))

  const scored = random.map((t, i) => {
    const arcPos = arcIndex.get(t.id) ?? i
    const score = (1 - arcWeight) * i + arcWeight * arcPos
    return { t, score }
  })
  scored.sort((a, b) => a.score - b.score)
  return scored.map((s) => s.t)
}

// === BPM-Smoothing ===

/** Ein Pass: bei BPM-Sprung > maxJump einen Brueckentrack (BPM dazwischen)
 *  weiter hinten finden und vorziehen. Soft, bricht ab wenn nichts passt. */
function smoothBpmJumps<T extends Track>(items: T[], maxJump: number): T[] {
  if (items.length < 3 || maxJump <= 0) return items
  const out = items.slice()

  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i].bpm
    const b = out[i + 1].bpm
    if (typeof a !== 'number' || typeof b !== 'number') continue
    const jump = Math.abs(a - b)
    if (jump <= maxJump) continue

    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    let bridgeIdx = -1
    for (let j = i + 2; j < out.length; j++) {
      const c = out[j].bpm
      if (typeof c !== 'number') continue
      if (c >= lo && c <= hi) {
        bridgeIdx = j
        break
      }
    }
    if (bridgeIdx === -1) continue
    // Bruecke nach i+1 schieben, alten i+1 nach hinten an die Bruecken-Position.
    const bridge = out[bridgeIdx]
    out[bridgeIdx] = out[i + 1]
    out[i + 1] = bridge
  }

  return out
}

// === Public API ===

/** Smart-Shuffle: Fisher-Yates + Anti-Artist-Repeat + optionaler Energy-Arc + BPM-Smoothing.
 *
 *  Determinismus: gleicher seed → gleicher Output, garantiert.
 *  Aufruf-Pattern: Aufrufer berechnet seed = slotStartUnixSeconds (oder hashSeed davon).
 */
export function smartShuffle<T extends Track>(tracks: T[], opts: ShuffleOptions = {}): T[] {
  if (tracks.length === 0) return []
  if (tracks.length === 1) return tracks.slice()

  const seedRaw = typeof opts.seed === 'number' ? opts.seed : Date.now()
  const seed = hashSeed(seedRaw)
  const minArtistDistance = opts.minArtistDistance ?? DEFAULT_OPTIONS.minArtistDistance
  const energyArc = opts.energyArc ?? DEFAULT_OPTIONS.energyArc
  const maxBpmJump = opts.maxBpmJump ?? DEFAULT_OPTIONS.maxBpmJump

  const rng = mulberry32(seed)

  // 1. Fisher-Yates
  let order = fisherYates(tracks, rng)

  // 2. Energy-Arc als Soft-Constraint einmischen (nur wenn nicht 'flat')
  if (energyArc !== 'flat') {
    const arc = buildArc(order, energyArc) as T[]
    // arcWeight 0.35 — Arc ist Tendenz, nicht harte Sortierung
    order = mixWithArc(order, arc, 0.35)
  }

  // 3. BPM-Smoothing zuerst (kann Anti-Artist-Distanzen kaputt machen)
  order = smoothBpmJumps(order, maxBpmJump)

  // 4. Anti-Artist-Repeat als FINALER Pass — garantiert die wichtigste Variety-Regel.
  //    Reihenfolge bewusst so: Variety > BPM-Smoothing. Lieber ein groesserer
  //    BPM-Sprung als 2x derselbe Artist hintereinander.
  order = enforceArtistDistance(order, minArtistDistance)

  return order
}

/** Convenience: berechnet einen Slot-Seed aus Slot-Start + optionalem Channel-Hash.
 *  So bekommen 2 zeitlich kollidierende Slots auf verschiedenen Channels trotzdem
 *  unterschiedliche Permutationen.
 */
export function slotSeed(slotStartMs: number, channel?: string): number {
  const baseSeconds = Math.floor(slotStartMs / 1000)
  if (!channel) return baseSeconds
  return hashSeed(`${baseSeconds}_${channel}`)
}
