// Vitest-Spec für die Timetable-Rotation (src/lib/timetable-rotation.ts).
// Pure Funktionen, keine DB nötig. Fokus: Determinismus + tatsächliche Wochentags-
// Varianz + lückenlose/überlappungsfreie 24h-Abdeckung pro Tag (24h-Vorschau-Vertrag
// für /schedule + MCP get_schedule + Timetable-API darf nicht brechen).

import { describe, it, expect } from 'vitest'
import {
  pickPhaseOffset,
  buildDaySlots,
  buildWeekSlots,
  windowEnd,
  BRAZILIAN_DAYS,
  BRAZILIAN_PRIME_HOURS,
  type SlotRow,
} from '../timetable-rotation'

const EVEN = [0, 4, 8, 12, 16, 20]
const ODD = [2, 6, 10, 14, 18, 22]
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

describe('timetable-rotation — windowEnd', () => {
  it('addiert 2h, wrapt um Mitternacht', () => {
    expect(windowEnd(0)).toBe(2)
    expect(windowEnd(20)).toBe(22)
    expect(windowEnd(22)).toBe(0)
  })
})

describe('timetable-rotation — pickPhaseOffset', () => {
  it('ist deterministisch: gleicher Seed + Tag → gleiches Ergebnis', () => {
    const a = pickPhaseOffset('phonk', 3, 'seed-x')
    const b = pickPhaseOffset('phonk', 3, 'seed-x')
    expect(a).toBe(b)
  })

  it('liefert nur 0 oder 2', () => {
    for (let day = 0; day < 7; day++) {
      expect([0, 2]).toContain(pickPhaseOffset('phonk', day, 'seed-x'))
      expect([0, 2]).toContain(pickPhaseOffset('hard', day, 'seed-x'))
    }
  })

  it('unterschiedliche Seeds können unterschiedliche Ergebnisse liefern (nicht konstant)', () => {
    const results = new Set(Array.from({ length: 20 }, (_, i) => pickPhaseOffset('phonk', 3, `seed-${i}`)))
    expect(results.size).toBeGreaterThan(1)
  })
})

describe('timetable-rotation — buildDaySlots', () => {
  it('baut genau einen Slot pro Start-Stunde für den gegebenen Tag', () => {
    const rows = buildDaySlots('pool-x', 'Test', [0, 4, 8], 3)
    expect(rows.length).toBe(3)
    expect(rows.every((r) => r.dayOfWeek === 3 && r.poolId === 'pool-x' && r.label === 'Test')).toBe(true)
    expect(rows.map((r) => r.startHour)).toEqual([0, 4, 8])
    expect(rows.map((r) => r.endHour)).toEqual([2, 6, 10])
  })
})

function coverageMinutes(rows: SlotRow[]): Set<number> {
  const covered = new Set<number>()
  for (const r of rows) {
    const start = r.startHour * 60 + r.startMin
    let end = r.endHour * 60 + r.endMin
    if (end <= start) end += 24 * 60 // Mitternachts-Wrap
    for (let m = start; m < end; m++) covered.add(m % (24 * 60))
  }
  return covered
}

describe('timetable-rotation — buildWeekSlots', () => {
  const week = (seed: string) => buildWeekSlots('phonk', 'braz', 'hard', EVEN, ODD, BRAZILIAN_DAYS, ALL_DAYS, seed)

  it('ist deterministisch: gleicher Seed → bitidentisches Ergebnis', () => {
    expect(week('seed-a')).toEqual(week('seed-a'))
  })

  it('erzeugt tatsächliche Varianz zwischen mindestens zwei Wochentagen', () => {
    const rows = week('seed-b')
    const sigOf = (day: number) =>
      JSON.stringify(
        rows
          .filter((r) => r.dayOfWeek === day && r.poolId !== 'braz')
          .map((r) => `${r.poolId}:${r.startHour}`)
          .sort(),
      )
    const signatures = new Set(Array.from({ length: 7 }, (_, d) => sigOf(d)))
    expect(signatures.size).toBeGreaterThan(1) // NICHT 7× identisch
  })

  it('Phonk und Hardphonk wechseln sich ab: zusammen lückenlos, nie gleichzeitig', () => {
    const rows = week('seed-c')
    for (let day = 0; day < 7; day++) {
      const phonk = rows.filter((r) => r.dayOfWeek === day && r.poolId === 'phonk')
      const hard = rows.filter((r) => r.dayOfWeek === day && r.poolId === 'hard')
      expect(phonk.length).toBe(6)
      expect(hard.length).toBe(6)
      const phonkMin = coverageMinutes(phonk)
      const hardMin = coverageMinutes(hard)
      expect(phonkMin.size + hardMin.size).toBe(24 * 60) // volle 24h, keine Lücke
      expect([...phonkMin].some((m) => hardMin.has(m))).toBe(false) // keine Überlappung
    }
  })

  it('Brazilian Phonk kommt genau zweimal pro Woche, abends parallel zu Hardphonk', () => {
    for (const seed of ['seed-d', 'seed-e', 'seed-f', 'seed-g']) {
      const rows = week(seed)
      const braz = rows.filter((r) => r.poolId === 'braz')
      expect(braz.length).toBe(2)
      expect(braz.map((r) => r.dayOfWeek).sort()).toEqual([...BRAZILIAN_DAYS].sort())
      for (const b of braz) {
        expect(BRAZILIAN_PRIME_HOURS).toContain(b.startHour)
        expect(b.subgenre).toBe('brazilian-phonk') // grüner Akzent im phonk-Channel
        const parallel = rows.find(
          (r) => r.poolId === 'hard' && r.dayOfWeek === b.dayOfWeek && r.startHour === b.startHour,
        )
        expect(parallel).toBeDefined()
      }
    }
  })
})
