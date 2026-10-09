// Timetable-Rotation — deterministische Wochentags-Varianz für den 24/7-Sendeplan.
//
// Reine Funktionen, keine Prisma-Abhängigkeit (client-safe, analog radio.ts) — testbar
// ohne DB. Genutzt von scripts/setup-timetable-24-7.ts beim (Re-)Seeden der
// TimetableSlot-Zeilen. Seit 09.10.2026 wechseln sich Phonk und Hardphonk im
// 2h-Raster ab; Brazilian Phonk kommt nur noch zweimal pro Woche, abends parallel
// zu einer Hardphonk-Session. Jeder Wochentag bekommt einen deterministisch
// gewürfelten 2h-Phasenversatz (wer eröffnet den Tag), damit die Woche nicht
// siebenmal identisch aussieht.
//
// SEASON_SEED von Hand bumpen, um die Rotation bewusst neu zu würfeln (bleibt bis
// dahin über beliebig viele Skript-Läufe reproduzierbar — Pflicht für /schedule,
// MCP get_schedule, Timetable-API: die 24h-Vorschau bleibt ein vorab bekannter Plan).

import { seededShuffle } from './radio'

export const SEASON_SEED = 'kbk-rotation-v1'

/** Wochentage mit Brazilian-Phonk-Session (Date.getDay(): 3 = Mittwoch, 6 = Samstag). */
export const BRAZILIAN_DAYS: readonly number[] = [3, 6]

/** Abendfenster (Start-Stunden, UTC), in denen die Brazilian-Session liegen darf.
 *  Je Phasenversatz des Tages beginnt genau eines davon mit einer Hardphonk-Session. */
export const BRAZILIAN_PRIME_HOURS: readonly number[] = [18, 20]

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

/** Baut die Slot-Zeilen für alle 7 Wochentage: Phonk (phonk-Channel) und Hardphonk
 *  (hardtek-Channel) wechseln sich im 2h-Raster ab, es sendet also immer genau einer
 *  der beiden. Der Phasenversatz je Wochentag entscheidet nur, wer den Tag eröffnet.
 *  An den `brazilianDays` läuft zusätzlich im phonk-Channel eine Brazilian-Phonk-
 *  Session parallel zur abendlichen Hardphonk-Session, dann senden beide Channels. */
export function buildWeekSlots(
  phonkId: string,
  brazilianId: string,
  hardtekId: string,
  evenHours: number[],
  oddHours: number[],
  brazilianDays: readonly number[] = BRAZILIAN_DAYS,
  allDays: number[] = [0, 1, 2, 3, 4, 5, 6],
  seed: string = SEASON_SEED,
): SlotRow[] {
  const rows: SlotRow[] = []
  for (const day of allDays) {
    const phonkOffset = pickPhaseOffset('phonk', day, seed)
    const phonkHours = phonkOffset === 0 ? evenHours : oddHours
    const hardphonkHours = phonkOffset === 0 ? oddHours : evenHours

    rows.push(
      ...buildDaySlots(phonkId, 'Phonk', phonkHours, day),
      ...buildDaySlots(hardtekId, 'Hardphonk', hardphonkHours, day),
    )
    if (brazilianDays.includes(day)) {
      const primeHours = hardphonkHours.filter((h) => BRAZILIAN_PRIME_HOURS.includes(h)).slice(0, 1)
      rows.push(...buildDaySlots(brazilianId, 'Brazilian Phonk', primeHours, day))
    }
  }
  return rows
}
