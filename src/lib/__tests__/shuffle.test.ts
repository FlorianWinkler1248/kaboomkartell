// Vitest-Spec für smartShuffle. Läuft mit `pnpm test`.

import { describe, it, expect } from 'vitest'
import { smartShuffle, slotSeed, hashSeed } from '../shuffle'

const makeTracks = (n: number, prefix = 't') =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    artistId: `artist-${i % Math.max(1, Math.floor(n / 5))}`,
    bpm: 120 + (i * 7) % 60,
    durationMs: 180_000,
  }))

describe('smartShuffle', () => {
  it('Test 1: 100 tracks - Output unterscheidet sich von Input', () => {
    const tracks = makeTracks(100)
    const out = smartShuffle(tracks, { seed: 12345 })
    expect(out).toHaveLength(100)
    // Wahrscheinlichkeit dass 100 Elemente in identischer Reihenfolge bleiben
    // ist verschwindend gering (1 / 100!).
    const identical = out.every((t, i) => t.id === tracks[i].id)
    expect(identical).toBe(false)
    // Alle IDs müssen weiterhin enthalten sein.
    expect(new Set(out.map((t) => t.id)).size).toBe(100)
  })

  it('Test 2: gleicher seed → identische Reihenfolge (Determinismus)', () => {
    const tracks = makeTracks(50)
    const a = smartShuffle(tracks, { seed: 999 })
    const b = smartShuffle(tracks, { seed: 999 })
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id))
  })

  it('Test 2b: unterschiedliche seeds → andere Reihenfolge', () => {
    const tracks = makeTracks(50)
    const a = smartShuffle(tracks, { seed: 1 })
    const b = smartShuffle(tracks, { seed: 2 })
    const same = a.every((t, i) => t.id === b[i].id)
    expect(same).toBe(false)
  })

  it('Test 3: 5 Artist A + 5 Artist B → kein Artist 2x in Folge', () => {
    const tracks = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, artistId: 'A', bpm: 130 })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, artistId: 'B', bpm: 140 })),
    ]
    const out = smartShuffle(tracks, { seed: 7, minArtistDistance: 2, energyArc: 'flat' })
    let directRepeats = 0
    for (let i = 1; i < out.length; i++) {
      if (out[i].artistId === out[i - 1].artistId) directRepeats++
    }
    expect(directRepeats).toBe(0)
  })

  it('Test 4: Pool zu klein für Constraint (5 alle Artist A) → graceful, kein crash', () => {
    const tracks = Array.from({ length: 5 }, (_, i) => ({
      id: `a${i}`,
      artistId: 'A',
      bpm: 130,
    }))
    expect(() => smartShuffle(tracks, { seed: 42, minArtistDistance: 3 })).not.toThrow()
    const out = smartShuffle(tracks, { seed: 42, minArtistDistance: 3 })
    expect(out).toHaveLength(5)
    expect(new Set(out.map((t) => t.id)).size).toBe(5)
  })

  it('Test 5: BPM-Daten + energyArc=wave → mittlere BPM eher in der Mitte', () => {
    // 9 Tracks mit klaren BPM-Stufen: 100, 110, 120, 130, 140, 150, 160, 170, 180.
    // Mit 'wave' sollten die hoechsten BPMs (180, 170) eher zur Mitte tendieren.
    const tracks = [100, 110, 120, 130, 140, 150, 160, 170, 180].map((bpm, i) => ({
      id: `t${i}`,
      artistId: `art-${i}`,
      bpm,
    }))
    const out = smartShuffle(tracks, { seed: 31415, energyArc: 'wave', minArtistDistance: 1 })

    // Mittelpunkt der Liste
    const mid = Math.floor(out.length / 2)
    // Index der Tracks mit BPM >= 160
    const highBpmIndices = out
      .map((t, i) => ({ bpm: t.bpm, i }))
      .filter((x) => x.bpm >= 160)
      .map((x) => x.i)

    // Soft-Check: durchschnittliche Position der High-BPMs ist naeher an der Mitte
    // als an einem der Raender. Mit Soft-Arc (Weight 0.35) ist das eine Tendenz.
    const avgPos = highBpmIndices.reduce((s, i) => s + i, 0) / highBpmIndices.length
    const distFromMid = Math.abs(avgPos - mid)
    const distFromEdge = Math.min(avgPos, out.length - 1 - avgPos)
    expect(distFromMid).toBeLessThanOrEqual(distFromEdge + 1)
  })

  it('Test 6: Empty pool → empty array, kein crash', () => {
    expect(smartShuffle([])).toEqual([])
    expect(smartShuffle([], { seed: 123 })).toEqual([])
  })

  it('Test 7: Single track → unverändert', () => {
    const tracks = [{ id: 'only', artistId: 'A', bpm: 130 }]
    expect(smartShuffle(tracks, { seed: 1 })).toEqual(tracks)
  })

  it('Test 8: maxBpmJump-Smoothing reduziert harte Spruenge', () => {
    // Konstruierter Worst-Case: 100, 200, 110, 190, 120, 180. Ohne Smoothing
    // liegt zwischen Nachbarn oft > 80 BPM. Smoothing soll das mildern.
    const tracks = [100, 200, 110, 190, 120, 180].map((bpm, i) => ({
      id: `t${i}`,
      artistId: `a${i}`,
      bpm,
    }))
    const out = smartShuffle(tracks, {
      seed: 7,
      energyArc: 'flat',
      minArtistDistance: 1,
      maxBpmJump: 30,
    })
    // Keine harte Garantie (Soft-Constraint), aber im Schnitt sollten die
    // Spruenge kleiner sein als ohne Sort.
    const jumps: number[] = []
    for (let i = 1; i < out.length; i++) {
      jumps.push(Math.abs((out[i].bpm ?? 0) - (out[i - 1].bpm ?? 0)))
    }
    const maxJump = Math.max(...jumps)
    // Wir erwarten: Smoothing schiebt mindestens einen Bruecken-Track ein,
    // also sind nicht alle Nachbar-Spruenge >= 70.
    const veryLargeJumps = jumps.filter((j) => j >= 70).length
    expect(veryLargeJumps).toBeLessThan(jumps.length)
    expect(maxJump).toBeLessThanOrEqual(100)
  })

  it('Test 9: slotSeed liefert pro Channel andere Seeds', () => {
    const ts = 1_700_000_000_000
    const phonk = slotSeed(ts, 'phonk')
    const hardtek = slotSeed(ts, 'hardtek')
    expect(phonk).not.toBe(hardtek)
    // gleiche Inputs → gleicher Output
    expect(slotSeed(ts, 'phonk')).toBe(phonk)
  })

  it('Test 10: hashSeed ist stabil und niemals 0', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
    expect(hashSeed('')).toBeGreaterThan(0)
    expect(hashSeed(0)).toBeGreaterThan(0)
  })
})
