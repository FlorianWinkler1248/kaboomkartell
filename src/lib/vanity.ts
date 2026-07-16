/**
 * Vanity-Metrik-Sichtbarkeit.
 *
 * Kleine/leere Community-Zähler ("4 wolves online", "+0 aura in last 24h",
 * "0 cast") verraten eine leere Community und schaden dem ersten Eindruck mehr
 * als sie nützen. Diese Schwellwerte sind der „wirkt-belebt"-Boden: liegt ein
 * Zähler darunter, wird er AUSGEBLENDET; erreicht er den Wert, erscheint er
 * automatisch — kein manuelles Umschalten, und vor allem: wir erfinden KEINE
 * Zahlen, wir zeigen sie nur, wenn sie echt etwas hergeben.
 *
 * Client-safe (reine Konstanten/Funktionen, kein prisma/fs) — import in Server-
 * Components, API-Routen UND Client-Components erlaubt. Sobald echter Traffic da
 * ist, hier zentral nachjustieren (oder einzelne Werte auf 0 setzen = immer zeigen).
 */

export const VANITY_MIN = {
  /** „N wolves online" (Hero + Ticker). */
  wolvesOnline: 12,
  /** „+N aura in last 24h" (Ticker). */
  aura24h: 25,
  /** „Artists on board" (LiveStats). */
  artists: 4,
  /** Crowd-Control: Gesamt-Stimmen im aktuellen Fenster („N cast" + Pro-Track-Zahlen). */
  votesCast: 5,
  /** Aura/Sus/Votes pro Track (VotingStats, Cockpit). */
  trackVotes: 5,
  /** „N plays" pro Track. */
  playCount: 50,
  /** „N wolves on it" pro Mission (Board + Detail). Schwelle 1 = ab der ersten
   *  echten Annahme sichtbar — bewusst niedrig (Missionen leben von Beteiligung),
   *  zentral hochdrehbar wenn das Board wächst. */
  missionAcceptances: 1,
} as const;

export type VanityKey = keyof typeof VANITY_MIN;

/** true, wenn der Wert hoch genug ist, um den Zähler zu zeigen. */
export function showVanity(value: number | null | undefined, key: VanityKey): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= VANITY_MIN[key];
}
