// Vitest-Spec für das Crowd-Control-Wahrscheinlichkeits-Modell (radio-probability.ts).
// Läuft mit `pnpm test`. Doku: prozesse/kbk-crowd-control.md

import { describe, it, expect } from 'vitest'
import {
  computeWeights,
  hardCooldownLength,
  softWindowLength,
  pickCandidates,
  resolveWinner,
  KEEP_MIN,
  MAX_HARD_COOLDOWN,
} from '../radio-probability'

const pool = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`)

// Kleiner deterministischer PRNG, damit Property-Fehler reproduzierbar sind.
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe('hardCooldownLength', () => {
  it('ist 0 für G < 2 (Single-Track-Pool wiederholt sich zwangsläufig)', () => {
    expect(hardCooldownLength(0)).toBe(0)
    expect(hardCooldownLength(1)).toBe(0)
  })

  it('sperrt bei G >= 2 immer mindestens den zuletzt gespielten Track', () => {
    expect(hardCooldownLength(2)).toBe(1)
    expect(hardCooldownLength(5)).toBe(1)
    expect(hardCooldownLength(6)).toBe(1)
  })

  it('wächst monoton mit G und ist bei MAX_HARD_COOLDOWN gedeckelt', () => {
    expect(hardCooldownLength(8)).toBe(3) // 8 - KEEP_MIN(5) = 3
    expect(hardCooldownLength(15)).toBe(10) // 15 - 5 = 10
    expect(hardCooldownLength(200)).toBe(MAX_HARD_COOLDOWN) // gedeckelt
  })
})

describe('softWindowLength', () => {
  it('lässt immer mindestens einen Voll-Gewicht-Track übrig', () => {
    for (const G of [1, 2, 3, 5, 8, 50, 200]) {
      const hard = hardCooldownLength(G)
      const soft = softWindowLength(G, hard)
      expect(G - hard - soft).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('computeWeights — Total-Invariante', () => {
  it('Σ probability == 1 und #(weight == 1) >= 1 über viele G und Historien', () => {
    const rnd = lcg(42)
    for (const G of [1, 2, 3, 5, 8, 50, 200]) {
      const ids = pool(G)
      for (let trial = 0; trial < 50; trial++) {
        // zufällige Historie aus Pool-Tracks (Länge 0..2G), most-recent-first
        const histLen = Math.floor(rnd() * (2 * G + 1))
        const recent = Array.from({ length: histLen }, () => ids[Math.floor(rnd() * G)])
        const w = computeWeights(ids, recent)

        const sum = w.reduce((s, t) => s + t.probability, 0)
        expect(sum).toBeCloseTo(1, 10)

        const full = w.filter((t) => t.weight === 1).length
        expect(full).toBeGreaterThanOrEqual(1) // niemals "leere Wahrscheinlichkeiten"

        // alle Wahrscheinlichkeiten nicht-negativ
        expect(w.every((t) => t.probability >= 0)).toBe(true)
      }
    }
  })

  it('leerer Pool → leeres Ergebnis', () => {
    expect(computeWeights([], ['x'])).toEqual([])
  })
})

describe('computeWeights — Recency-Regeln', () => {
  it('zuletzt gespielter Track ist bei G >= 2 hart gesperrt (weight 0)', () => {
    const ids = pool(10)
    const w = computeWeights(ids, ['t3']) // t3 zuletzt gespielt
    expect(w.find((t) => t.trackId === 't3')!.weight).toBe(0)
    expect(w.find((t) => t.trackId === 't3')!.probability).toBe(0)
  })

  it('Track ausserhalb der History bekommt volles Gewicht', () => {
    const ids = pool(10)
    const w = computeWeights(ids, ['t0', 't1', 't2'])
    expect(w.find((t) => t.trackId === 't9')!.weight).toBe(1)
  })

  it('Soft-Fenster halbiert das Gewicht', () => {
    // G=8 → hard=3, soft=min(ceil(8/4)=2, 8-3-1=4)=2. recent[3..4] sind soft.
    const ids = pool(8)
    const recent = ['t0', 't1', 't2', 't3', 't4'] // 0..2 hart, 3..4 soft
    const w = computeWeights(ids, recent)
    expect(w.find((t) => t.trackId === 't3')!.weight).toBe(0.5)
    expect(w.find((t) => t.trackId === 't4')!.weight).toBe(0.5)
    expect(w.find((t) => t.trackId === 't0')!.weight).toBe(0)
    expect(w.find((t) => t.trackId === 't7')!.weight).toBe(1)
  })

  it('pool-lokal: History-Tracks ausserhalb des Pools beeinflussen die Gewichte nicht', () => {
    const ids = pool(5)
    // Nur Fremd-Tracks in der History → KEIN Pool-Track liegt im Hard-/Soft-Fenster,
    // also bekommen alle Pool-Tracks volles Gewicht (Fremd-Tracks "verbrauchen" die
    // Fenster-Plätze, ohne Pool-Gewichte zu senken).
    const w = computeWeights(ids, ['foreign1', 'foreign2', 'foreign3'])
    expect(w.every((t) => t.weight === 1)).toBe(true)
  })
})

describe('pickCandidates', () => {
  it('liefert die Top-5 nach Wahrscheinlichkeit (weight > 0)', () => {
    const ids = pool(20)
    const w = computeWeights(ids, ['t0', 't1', 't2']) // t0 hart gesperrt
    const cands = pickCandidates(w, 5, 'seed1')
    expect(cands).toHaveLength(5)
    expect(cands.every((c) => c.weight > 0)).toBe(true)
    expect(cands.find((c) => c.trackId === 't0')).toBeUndefined() // gesperrter nicht dabei
  })

  it('ist deterministisch bei gleichem Seed und seed-sensitiv im Tie-Break', () => {
    const ids = pool(12)
    const w = computeWeights(ids, []) // alle gleich wahrscheinlich → Tie-Break entscheidet
    // deterministisch: gleicher Seed → identisches Ergebnis
    const a = pickCandidates(w, 5, 'seedX').map((c) => c.trackId)
    expect(pickCandidates(w, 5, 'seedX').map((c) => c.trackId)).toEqual(a)
    // seed-sensitiv: über mehrere Seeds entsteht > 1 verschiedene Reihenfolge
    // (zwei einzelne Seeds dürfen kollidieren — daher über eine Stichprobe prüfen).
    const orderings = new Set(
      ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'].map((s) =>
        pickCandidates(w, 5, s)
          .map((c) => c.trackId)
          .join(','),
      ),
    )
    expect(orderings.size).toBeGreaterThan(1)
  })

  it('degradiert auf weniger als 5 Kandidaten bei kleinem Pool', () => {
    const ids = pool(3)
    const w = computeWeights(ids, ['t0']) // t0 gesperrt → 2 eligible
    const cands = pickCandidates(w, 5, 's')
    expect(cands.length).toBe(2)
  })
})

describe('resolveWinner', () => {
  const cands = [
    { trackId: 'a', probability: 0.4 },
    { trackId: 'b', probability: 0.35 },
    { trackId: 'c', probability: 0.25 },
  ]

  it('Mehrheit gewinnt', () => {
    expect(resolveWinner(cands, { a: 3, b: 5, c: 1 }, 's')).toBe('b')
  })

  it('Gleichstand → höhere Wahrscheinlichkeit gewinnt', () => {
    expect(resolveWinner(cands, { a: 2, b: 2, c: 0 }, 's')).toBe('a')
  })

  it('keine Stimmen → seeded-deterministischer Pick (stabil über Aufrufe)', () => {
    const w1 = resolveWinner(cands, {}, 'slot_42')
    const w2 = resolveWinner(cands, {}, 'slot_42')
    expect(w1).toBe(w2)
    expect(['a', 'b', 'c']).toContain(w1)
  })

  it('verschiedene Seeds können verschiedene Fallback-Gewinner ergeben', () => {
    const picks = new Set(
      Array.from({ length: 20 }, (_, i) => resolveWinner(cands, {}, `slot_${i}`)),
    )
    expect(picks.size).toBeGreaterThan(1) // nicht immer derselbe
  })

  it('einzelner Kandidat gewinnt immer; leere Liste → null', () => {
    expect(resolveWinner([{ trackId: 'only', probability: 1 }], {}, 's')).toBe('only')
    expect(resolveWinner([], {}, 's')).toBeNull()
  })
})
