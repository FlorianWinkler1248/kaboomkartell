// Vitest-Spec für die Timetable-Rotation (src/lib/timetable-rotation.ts).
// Pure Funktionen, keine DB nötig. Fokus: Determinismus + tatsächliche Wochentags-
// Varianz + lückenlose/überlappungsfreie 24h-Abdeckung pro Tag (24h-Vorschau-Vertrag
// für /schedule + MCP get_schedule + Timetable-API darf nicht brechen).

import { describe, it, expect } from 'vitest'
import { pickPhaseOffset, buildDaySlots, buildWeekSlots, windowEnd, type SlotRow } from '../timetable-rotation'

const PHONK = [0, 4, 8, 12, 16, 20]
const BRAZILIAN = [2, 6, 10, 14, 18, 22]
const HARDPHONK = [0, 4, 8, 12, 16, 20]

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
  it('ist deterministisch: gleicher Seed → bitidentisches Ergebnis', () => {
    const a = buildWeekSlots('phonk', 'braz', 'hard', PHONK, BRAZILIAN, HARDPHONK, [0, 1, 2, 3, 4, 5, 6], 'seed-a')
    const b = buildWeekSlots('phonk', 'braz', 'hard', PHONK, BRAZILIAN, HARDPHONK, [0, 1, 2, 3, 4, 5, 6], 'seed-a')
    expect(a).toEqual(b)
  })

  it('erzeugt tatsächliche Varianz zwischen mindestens zwei Wochentagen', () => {
    const rows = buildWeekSlots('phonk', 'braz', 'hard', PHONK, BRAZILIAN, HARDPHONK, [0, 1, 2, 3, 4, 5, 6], 'seed-b')
    const sigOf = (day: number) =>
      JSON.stringify(
        rows
          .filter((r) => r.dayOfWeek === day)
          .map((r) => `${r.poolId}:${r.startHour}`)
          .sort(),
      )
    const signatures = new Set(Array.from({ length: 7 }, (_, d) => sigOf(d)))
    expect(signatures.size).toBeGreaterThan(1) // NICHT mehr 7× identisch
  })

  it('phonk-Channel bleibt pro Tag lückenlos + überlappungsfrei über 24h (Phonk+Brazilian zusammen)', () => {
    const rows = buildWeekSlots('phonk', 'braz', 'hard', PHONK, BRAZILIAN, HARDPHONK, [0, 1, 2, 3, 4, 5, 6], 'seed-c')
    for (let day = 0; day < 7; day++) {
      const dayRows = rows.filter((r) => r.dayOfWeek === day && (r.poolId === 'phonk' || r.poolId === 'braz'))
      expect(dayRows.length).toBe(PHONK.length + BRAZILIAN.length) // 12 Slots, keine verloren
      const covered = coverageMinutes(dayRows)
      expect(covered.size).toBe(24 * 60) // volle 24h abgedeckt, keine Lücke
    }
  })

  it('hardtek-Channel bleibt bei 6 Slots/Tag à 2h, unabhängig vom Phasenversatz', () => {
    const rows = buildWeekSlots('phonk', 'braz', 'hard', PHONK, BRAZILIAN, HARDPHONK, [0, 1, 2, 3, 4, 5, 6], 'seed-d')
    for (let day = 0; day < 7; day++) {
      const dayRows = rows.filter((r) => r.dayOfWeek === day && r.poolId === 'hard')
      expect(dayRows.length).toBe(HARDPHONK.length)
      for (const r of dayRows) expect(windowEnd(r.startHour)).toBe(r.endHour)
    }
  })
})
