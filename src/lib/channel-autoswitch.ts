// Auto-Switch der Radio-Channels — reine Entscheidungslogik, ohne React und ohne Netz.
//
// Seit 09.10.2026 wechseln sich Phonk und Hardphonk im Sendeplan ab; meist sendet
// also nur einer der beiden Channels. Endet das Set im gewählten Channel, während
// der andere sendet, kündigt der Player den Wechsel an. Oberste Regel: die Musik
// reißt nicht ab. Gewechselt wird deshalb spätestens, wenn der eigene letzte Titel
// endet; beginnt im Ziel-Channel vorher ein neuer Titel, dann genau dort. Der Hörer
// kann vorher abbrechen.

/** Die Channels, zwischen denen automatisch gewechselt wird (LIVE gehört nicht dazu). */
export const AUTO_SWITCH_CHANNELS: readonly string[] = ['phonk', 'hardtek']

/** Countdown, wenn im eigenen Channel schon nichts mehr läuft: kurz, damit die
 *  Stille kurz bleibt, aber lang genug zum Abbrechen. */
export const AUTO_SWITCH_SILENT_MS = 5_000

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

/** Zeitpunkt des Wechsels (Server-Zeit, ms).
 *
 *  Läuft im eigenen Channel noch der letzte Titel, wird spätestens an dessen Ende
 *  gewechselt — früher nur, wenn im Ziel-Channel vorher ein neuer Titel beginnt
 *  (sauberer Einstieg). Läuft im eigenen Channel nichts mehr, gilt der kurze feste
 *  Countdown: auf einen Titelbeginn zu warten hieße, in Stille zu warten. */
export function computeSwitchAtMs(
  ownTrackEndsAtMs: number | null,
  targetTrackEndsAtMs: number | null,
  serverNowMs: number,
): number {
  const ownPlaying = ownTrackEndsAtMs !== null && Number.isFinite(ownTrackEndsAtMs) && ownTrackEndsAtMs > serverNowMs
  if (!ownPlaying) return serverNowMs + AUTO_SWITCH_SILENT_MS
  const targetStartKnown =
    targetTrackEndsAtMs !== null && Number.isFinite(targetTrackEndsAtMs) && targetTrackEndsAtMs > serverNowMs
  return targetStartKnown ? Math.min(ownTrackEndsAtMs, targetTrackEndsAtMs) : ownTrackEndsAtMs
}

/** Restzeit als m:ss für die Anzeige. */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
