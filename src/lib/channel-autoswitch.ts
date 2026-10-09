// Auto-Switch der Radio-Channels — reine Entscheidungslogik, ohne React und ohne Netz.
//
// Seit 09.10.2026 wechseln sich Phonk und Hardphonk im Sendeplan ab; meist sendet
// also nur einer der beiden Channels. Endet das Set im gewählten Channel, während
// der andere sendet, schlägt der Player den Wechsel vor und führt ihn zum Beginn
// des nächsten Titels im Ziel-Channel aus. Der Hörer kann vorher abbrechen.

/** Die Channels, zwischen denen automatisch gewechselt wird (LIVE gehört nicht dazu). */
export const AUTO_SWITCH_CHANNELS: readonly string[] = ['phonk', 'hardtek']

/** Countdown, wenn der Titelbeginn im Ziel-Channel nicht bekannt ist. */
export const AUTO_SWITCH_FALLBACK_MS = 10_000

/** Ziel-Channel für den Auto-Switch oder null, wenn nicht gewechselt werden soll.
 *  `scheduled` sind die Channels mit laufendem Set (ohne ausspielenden letzten
 *  Titel); null heißt, der Server hat das Feld nicht geliefert. */
export function pickAutoSwitchTarget(
  selected: string,
  scheduled: readonly string[] | null,
  channels: readonly string[] = AUTO_SWITCH_CHANNELS,
): string | null {
  if (!scheduled) return null
  if (!channels.includes(selected)) return null
  if (scheduled.includes(selected)) return null
  return channels.find((c) => c !== selected && scheduled.includes(c)) ?? null
}

/** Zeitpunkt des Wechsels (Server-Zeit, ms): das Ende des laufenden Titels im
 *  Ziel-Channel, also der Beginn des nächsten. Ohne brauchbaren Wert greift ein
 *  kurzer fester Countdown. */
export function computeSwitchAtMs(targetTrackEndsAtMs: number | null, serverNowMs: number): number {
  if (targetTrackEndsAtMs !== null && Number.isFinite(targetTrackEndsAtMs) && targetTrackEndsAtMs > serverNowMs) {
    return targetTrackEndsAtMs
  }
  return serverNowMs + AUTO_SWITCH_FALLBACK_MS
}

/** Restzeit als m:ss für die Anzeige. */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
