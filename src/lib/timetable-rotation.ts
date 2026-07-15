// Timetable-Rotation — deterministische Wochentags-Varianz für den 24/7-Sendeplan.
//
// Reine Funktionen, keine Prisma-Abhängigkeit (client-safe, analog radio.ts) — testbar
// ohne DB. Genutzt von scripts/setup-timetable-24-7.ts beim (Re-)Seeden der
// TimetableSlot-Zeilen. Vorher: das 2h-Raster wiederholte sich jeden Wochentag
// IDENTISCH (Phonk immer auf geraden, Brazilian immer auf ungeraden 2h-Blöcken;
// Hardphonk deckungsgleich mit Phonk). Jetzt bekommt jeder Wochentag einen
// deterministisch gewürfelten 2h-Phasenversatz — reiner Versatz, keine Umsortierung,
// daher bleibt die Kachelung pro Tag lückenlos + überlappungsfrei.
//
// SEASON_SEED von Hand bumpen, um die Rotation bewusst neu zu würfeln (bleibt bis
// dahin über beliebig viele Skript-Läufe reproduzierbar — Pflicht für /schedule,
// MCP get_schedule, Timetable-API: die 24h-Vorschau bleibt ein vorab bekannter Plan).

import { seededShuffle } from './radio'

export const SEASON_SEED = 'kbk-rotation-v1'

/** Deterministischer 2h-Phasenversatz (0 oder 2) für einen Wochentag + Namensraum.
 *  Nutzt den bestehenden seeded PRNG (`seededShuffle`) statt einen neuen zu bauen. */
export function pickPhaseOffset(namespace: string, dayOfWeek: number, seed: string = SEASON_SEED): 0 | 2 {
  return seededShuffle([0, 2] as const, `${seed}_${namespace}_${dayOfWeek}`)[0]
}

/** Ende eines 2h-Fensters (22 → 0 = Mitternacht; Engine behandelt endHour<start als Mitternachts-Slot). */
export function windowEnd(startHour: number): number {
  return (startHour + 2) % 24
}

export interface SlotRow {
  dayOfWeek: number
  startHour: number
  startMin: number
  endHour: number
  endMin: number
  label: string
  poolId: string
  priority: number
}

export function buildDaySlots(poolId: string, label: string, startHours: number[], day: number): SlotRow[] {
  return startHours.map((sh) => ({
    dayOfWeek: day,
    startHour: sh,
    startMin: 0,
    endHour: windowEnd(sh),
    endMin: 0,
    label,
    poolId,
    priority: 0,
  }))
}

/** Baut die Slot-Zeilen für alle 7 Wochentage — pro Tag mit eigenem Phasenversatz.
 *  Phonk/Brazilian tauschen sich pro Tag ggf. die Basis-Stunden (bleibt lückenlos, da
 *  beide Arrays zusammen immer die vollen 24h abdecken); Hardphonk bekommt einen
 *  unabhängigen Versatz, statt stur mit Phonk deckungsgleich zu bleiben. */
export function buildWeekSlots(
  phonkId: string,
  brazilianId: string,
  hardtekId: string,
  phonkHoursBase: number[],
  brazilianHoursBase: number[],
  hardphonkHoursBase: number[],
  allDays: number[] = [0, 1, 2, 3, 4, 5, 6],
  seed: string = SEASON_SEED,
): SlotRow[] {
  const rows: SlotRow[] = []
  for (const day of allDays) {
    const phonkOffset = pickPhaseOffset('phonk', day, seed)
    const hardOffset = pickPhaseOffset('hard', day, seed)
    const phonkHours = phonkOffset === 0 ? phonkHoursBase : brazilianHoursBase
    const brazilianHours = phonkOffset === 0 ? brazilianHoursBase : phonkHoursBase
    const hardphonkHours = hardOffset === 0 ? hardphonkHoursBase : hardphonkHoursBase.map((h) => (h + 2) % 24)

    rows.push(
      ...buildDaySlots(phonkId, 'Phonk', phonkHours, day),
      ...buildDaySlots(brazilianId, 'Brazilian Phonk', brazilianHours, day),
      ...buildDaySlots(hardtekId, 'Hardphonk', hardphonkHours, day),
    )
  }
  return rows
}
