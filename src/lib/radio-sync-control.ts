/**
 * Radio Sync v2 — „The Conductor" Regelgesetz (rein, browser-frei, CI-testbar).
 *
 * MENTALES MODELL
 * ---------------
 * Der Server ist der Dirigent: er besitzt pro Channel die autoritative Zeitlinie
 * (welcher Track läuft, sein `startedAt`/`endsAt` in Server-Zeit, und — sobald
 * gelockt — der nächste Track). Jeder Client ist ein Musiker, der sein lokales
 * Audio per Phase-Locked-Loop (PLL) an den Taktstock koppelt:
 *
 *   - kleiner Phasenfehler  → minimaler playbackRate-Nudge (Tempo-only, unhörbar)
 *   - großer Phasenfehler   → einmaliger harter Re-Seek (z.B. nach Tab-Schlaf)
 *   - Track-Ende erreicht   → schedule-getriebener Wechsel auf den gelockten Track
 *
 * Ein einziges Regelgesetz ersetzt den früheren Sonderfall-Wust in useRadioSync
 * (300s-Schwelle, „<3s"-Mid-Cut, „Client voraus"). Weil es eine reine Funktion
 * ist, lässt es sich ohne Browser deterministisch testen — so muss das
 * Wiedergabe-System nicht mehr per Trial-and-Error nachjustiert werden.
 *
 * Vorzeichen-Konvention: `error = audioTime − targetPos`.
 *   error < 0 ⟹ Audio HINTER dem Taktstock ⟹ schneller (rate > 1)
 *   error > 0 ⟹ Audio VOR dem Taktstock    ⟹ langsamer (rate < 1)
 */

export interface SyncInput {
  /** Geschätzte Server-Zeit JETZT (ms) = Date.now() + clockOffset. */
  serverNowMs: number
  /** Absoluter Start der laufenden Track-Instanz (ms, Server-Zeit). */
  startedAtMs: number
  /** Absolutes Ende der laufenden Track-Instanz (ms, Server-Zeit). */
  endsAtMs: number
  /** Track-Id, die der Server gerade als laufend meldet (null = Off-Air/Live-Stream). */
  serverTrackId: string | null
  /** Track-Id, die das Audio-Element gerade abspielt (null = nichts geladen). */
  audioTrackId: string | null
  /** Aktuelle Audio-Position (Sekunden). */
  audioTimeSec: number
  /** Audio-Dauer laut Element (Sekunden, 0/NaN wenn Metadaten noch nicht geladen). */
  audioDurationSec: number
  /** Gelockter nächster Track (Id); null solange das Vote-Fenster offen ist. */
  nextTrackId: string | null
}

export type SyncAction =
  | { kind: 'idle' }
  | { kind: 'hold'; playbackRate: 1 }
  | { kind: 'slew'; playbackRate: number }
  | { kind: 'seek'; seekToSec: number; playbackRate: 1 }
  | { kind: 'switch'; trackId: string; seekToSec: number }

/** Tunables des Regelkreises — bewusst an EINER Stelle, dokumentiert, getestet. */
export const SYNC = {
  /** Unter diesem Phasenfehler kein Eingriff (imperceptibel). */
  DEADBAND_SEC: 0.75,
  /** Ab diesem Fehler harter Re-Seek statt Tempo-Nudge (großer Versatz). */
  SEEK_MAX_SEC: 6,
  /** Tempo-Korridor: ±4 % (Tempo-only, preservesPitch=true → praktisch unhörbar). */
  MAX_RATE_DELTA: 0.04,
  /** Proportional-Verstärkung: 1 s Fehler → 4 % Rate (erreicht den Korridor bei 1 s). */
  GAIN_PER_SEC: 0.04,
} as const

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

/**
 * Das Regelgesetz: gegeben Conductor-Zeitlinie + Audio-Zustand → nächste Aktion.
 * Aufrufer (useRadioSync) führt die Aktion aus und rollt bei `switch` die lokale
 * Schedule-Sicht weiter (current ← next), damit kein Doppel-Switch entsteht.
 */
export function computeSyncAction(input: SyncInput): SyncAction {
  const {
    serverNowMs, startedAtMs, endsAtMs, serverTrackId,
    audioTrackId, audioTimeSec, audioDurationSec, nextTrackId,
  } = input

  // Kein sendefähiger Track (Off-Air / Live-Stream) → nichts regeln.
  if (!serverTrackId) return { kind: 'idle' }

  // 1) Track-Ende erreicht: auf den gelockten nächsten Track wechseln, sofern wir
  //    nicht schon dort sind. Der nächste Track startet bei endsAt → Ziel-Position
  //    = serverNow − endsAt (≈ 0 bei exakten Dauern; > 0 falls der Poll später kam).
  if (serverNowMs >= endsAtMs) {
    if (nextTrackId && audioTrackId !== nextTrackId) {
      return { kind: 'switch', trackId: nextTrackId, seekToSec: Math.max(0, (serverNowMs - endsAtMs) / 1000) }
    }
    // Ende erreicht, aber nächster Track noch unbekannt (Fenster nicht gelockt)
    // oder bereits lokal gewechselt → auf Schedule-Update warten (Recovery-Poll).
    return { kind: 'idle' }
  }

  // Ziel-Position laut Taktstock.
  const targetPosSec = (serverNowMs - startedAtMs) / 1000

  // 2) Client ist dem (faul vorrückenden / überlaufenden) Server VORAUS: das Audio
  //    spielt bereits den gelockten NÄCHSTEN Track, der Server-Poll meldet aber noch
  //    den aktuellen. Passiert am Track-Übergang (Server rückt erst beim Poll nach
  //    endsAt vor) und verstärkt sich, wenn die DB-Dauer länger als das echte MP3 ist
  //    (Audio endete früher). NICHT auf den alten Track zurückreißen — draufbleiben,
  //    bis der Server vorrückt. Sonst Boundary-Ping-Pong + Dauer-„SYNCING"-Stutter.
  if (nextTrackId && audioTrackId === nextTrackId && serverTrackId !== nextTrackId) {
    return { kind: 'hold', playbackRate: 1 }
  }

  // 3) Audio spielt einen anderen Track als der Server meldet → auf Server-Track
  //    wechseln (echter Track-Wechsel, vom Poll erkannt; oder initialer Einstieg).
  if (audioTrackId !== serverTrackId) {
    return { kind: 'switch', trackId: serverTrackId, seekToSec: Math.max(0, targetPosSec) }
  }

  // 4) Gleicher Track → Phasenfehler bestimmen und sanft/hart korrigieren.
  const error = audioTimeSec - targetPosSec
  const absErr = Math.abs(error)

  if (absErr < SYNC.DEADBAND_SEC) {
    return { kind: 'hold', playbackRate: 1 }
  }

  if (absErr >= SYNC.SEEK_MAX_SEC) {
    const clampedTarget = audioDurationSec > 0
      ? clamp(targetPosSec, 0, audioDurationSec)
      : Math.max(0, targetPosSec)
    return { kind: 'seek', seekToSec: clampedTarget, playbackRate: 1 }
  }

  // Moderater Drift → Tempo-Nudge im ±MAX_RATE_DELTA-Korridor.
  const rate = clamp(
    1 - error * SYNC.GAIN_PER_SEC,
    1 - SYNC.MAX_RATE_DELTA,
    1 + SYNC.MAX_RATE_DELTA,
  )
  return { kind: 'slew', playbackRate: rate }
}

/** UI-Status für den „Beatmatch"-Indikator, abgeleitet aus der Aktion. */
export type SyncStatus = 'idle' | 'synced' | 'beatmatching' | 'seeking'

export function statusForAction(action: SyncAction): SyncStatus {
  switch (action.kind) {
    case 'idle': return 'idle'
    case 'hold': return 'synced'
    case 'slew': return 'beatmatching'
    case 'seek':
    case 'switch': return 'seeking'
  }
}
