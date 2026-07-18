// Crowd-Control Wahrscheinlichkeits-Modell — reine, deterministische Funktionen.
//
// KEIN prisma/fs/server-Import → client-safe (Boundary, siehe radio-types.ts).
// Doku + Begründung: prozesse/kbk-crowd-control.md, ADR-026.
//
// Idee: Jeder Track im Slot-Pool bekommt ein Gewicht aus seiner Recency (vor wie
// vielen Plays er pool-lokal zuletzt lief): Hard-Cooldown → 0, Soft-Fenster → 0.5,
// sonst 1. P = Gewicht ÷ Summe. Die Cooldown-Länge ist an die Poolgröße G gekoppelt,
// daher gilt IMMER #(Gewicht == 1) ≥ 1 — es gibt nie "leere Wahrscheinlichkeiten".

import { hashSeed } from './shuffle'

export const KEEP_MIN = 5 // so viele Voll-Gewicht-Kandidaten bleiben mindestens übrig
export const MAX_HARD_COOLDOWN = 35 // Obergrenze der Hard-Sperre (Flow-Freigabe 18.07.2026: 35 statt 10 — Pools auf 31–60 Tracks gewachsen, ein 2h-Slot (~35 Plays) bleibt damit wiederholungsfrei)
export const SOFT_WEIGHT = 0.5 // halbes Gewicht im Soft-Fenster (das "Halbieren")
export const DEFAULT_CANDIDATES = 5 // Top-N Vote-Kandidaten

export interface WeightedTrack {
  trackId: string
  /** 0 (Hard-Cooldown) | SOFT_WEIGHT | 1 */
  weight: number
  /** weight ÷ Σ weight, summiert über den Pool zu 1. */
  probability: number
}

function clamp(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Gut gemischter, seed-abhängiger Sortier-Schlüssel pro Track.
 *
 *  WICHTIG: Ein naives `hashSeed(`${seed}_${id}`)` taugt NICHT als Tie-Break, weil
 *  sich der gemeinsame Seed-Präfix in der Differenz zweier Tracks (djb2-Linearität)
 *  weitgehend aufhebt — die Top-5 wären bei uniformer Verteilung seed-UNABHÄNGIG und
 *  damit vorhersehbar. Hier mischen wir Seed- und Track-Hash nicht-linear
 *  (golden-ratio-XOR + xorshift-multiply), sodass jeder Seed eine echte andere
 *  Permutation ergibt. Deterministisch: gleicher (seed, id) → gleicher Schlüssel. */
function seededKey(seed: string, trackId: string): number {
  let x = (hashSeed(seed) ^ Math.imul(hashSeed(trackId), 0x9e3779b1)) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x45d9f3b)
  x ^= x >>> 16
  return x >>> 0
}

/** Länge des Hard-Cooldowns in Anzahl Plays, gekoppelt an die Poolgröße G.
 *  G ≥ 2 → mindestens 1 (zuletzt gespielter Track immer gesperrt), höchstens
 *  MAX_HARD_COOLDOWN, und nie so groß, dass < KEEP_MIN volle Kandidaten bleiben. */
export function hardCooldownLength(
  poolSize: number,
  keepMin = KEEP_MIN,
  maxHard = MAX_HARD_COOLDOWN,
): number {
  if (poolSize < 2) return 0
  return clamp(1, maxHard, poolSize - keepMin)
}

/** Länge des Soft-Fensters (halbes Gewicht) direkt nach dem Hard-Cooldown.
 *  ~G/4, aber so gedeckelt, dass immer ≥ 1 Track volles Gewicht behält. */
export function softWindowLength(poolSize: number, hardLen: number): number {
  const quarter = Math.ceil(poolSize / 4)
  return Math.max(0, Math.min(quarter, poolSize - hardLen - 1))
}

/**
 * Gewichte + Wahrscheinlichkeiten je Pool-Track aus der pool-lokalen Play-History.
 *
 * @param poolTrackIds   alle aktuell sendefähigen Tracks des Slots (Reihenfolge egal)
 * @param recentTrackIds zuletzt gespielte trackIds, **INDEX 0 = zuletzt gespielt**
 *                       (pool-lokal; Tracks außerhalb des Pools werden ignoriert)
 *
 * Garantie: für poolSize ≥ 1 ist Σ probability == 1 und (für poolSize ≥ 1) gibt es
 * ≥ 1 Track mit weight == 1 — keine leeren Wahrscheinlichkeiten.
 */
export function computeWeights(
  poolTrackIds: string[],
  recentTrackIds: string[],
  opts: { keepMin?: number; maxHard?: number; softWeight?: number } = {},
): WeightedTrack[] {
  const keepMin = opts.keepMin ?? KEEP_MIN
  const maxHard = opts.maxHard ?? MAX_HARD_COOLDOWN
  const softWeight = opts.softWeight ?? SOFT_WEIGHT
  const G = poolTrackIds.length
  if (G === 0) return []

  const hardLen = hardCooldownLength(G, keepMin, maxHard)
  const softLen = softWindowLength(G, hardLen)

  // Sliding-Window über die Play-History: die letzten hardLen Plays sind hart
  // gesperrt, die hardLen..hardLen+softLen davor weich abgewertet.
  const hardSet = new Set(recentTrackIds.slice(0, hardLen))
  const softSet = new Set(recentTrackIds.slice(hardLen, hardLen + softLen))

  const raw = poolTrackIds.map((trackId) => {
    let weight = 1
    if (hardSet.has(trackId)) weight = 0
    else if (softSet.has(trackId)) weight = softWeight
    return { trackId, weight }
  })

  const sum = raw.reduce((s, t) => s + t.weight, 0)
  // Defensive: bei (durch die Invariante eigentlich unmöglichem) Total 0 → uniform,
  // damit nie NaN/leere Verteilung entsteht.
  if (sum <= 0) {
    return raw.map((t) => ({ trackId: t.trackId, weight: 1, probability: 1 / G }))
  }
  return raw.map((t) => ({ trackId: t.trackId, weight: t.weight, probability: t.weight / sum }))
}

/** Top-N Kandidaten nach Wahrscheinlichkeit. Tie-Break ist **seeded** (stabil pro
 *  decisionSeq), damit gleich-wahrscheinliche Tracks nicht immer in Insertion-/
 *  Alphabet-Reihenfolge erscheinen. Liefert nur Tracks mit weight > 0, außer es gibt
 *  keine — dann den ganzen (degradierten) Pool. */
export function pickCandidates(
  weighted: WeightedTrack[],
  n = DEFAULT_CANDIDATES,
  seed = 'cc',
): WeightedTrack[] {
  const eligible = weighted.filter((t) => t.weight > 0)
  const pool = eligible.length > 0 ? eligible : weighted
  const sorted = [...pool].sort((a, b) => {
    if (b.probability !== a.probability) return b.probability - a.probability
    return seededKey(seed, a.trackId) - seededKey(seed, b.trackId)
  })
  return sorted.slice(0, Math.min(n, sorted.length))
}

/** Bestimmt den Gewinner des Vote-Fensters.
 *  - Stimmen vorhanden → Mehrheit; Gleichstand → höhere Wahrscheinlichkeit → seeded.
 *  - Keine Stimmen → **seeded-uniform** unter den Kandidaten (kein Math.random,
 *    damit reproduzierbar/testbar).
 *  Gibt die gewinnende trackId zurück (oder null bei leerer Kandidatenliste). */
export function resolveWinner(
  candidates: ReadonlyArray<{ trackId: string; probability: number }>,
  voteCounts: Record<string, number>,
  seed: string,
): string | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0].trackId

  const totalVotes = candidates.reduce((s, c) => s + (voteCounts[c.trackId] ?? 0), 0)

  if (totalVotes === 0) {
    const idx = hashSeed(`${seed}_pick`) % candidates.length
    return candidates[idx].trackId
  }

  const ranked = [...candidates].sort((a, b) => {
    const va = voteCounts[a.trackId] ?? 0
    const vb = voteCounts[b.trackId] ?? 0
    if (vb !== va) return vb - va
    if (b.probability !== a.probability) return b.probability - a.probability
    return seededKey(seed, a.trackId) - seededKey(seed, b.trackId)
  })
  return ranked[0].trackId
}
