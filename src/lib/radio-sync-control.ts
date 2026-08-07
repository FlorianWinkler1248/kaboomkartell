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
  // --- Radio Sync v3 (ADR-040) — alle OPTIONAL. Fehlen sie, verhält sich das
  // --- Regelgesetz EXAKT wie v2 (Kill-Switch-Semantik, per Test belegt).
  /** Audio-Element meldet Puffer-Stall (waiting/stalled/error). */
  stalled?: boolean
  /** Letzte Aktion war ein Slew → Hysterese: engere Austritts-Schwelle. */
  isSlewing?: boolean
  /** Quelle ist ein lokaler Blob (seek billig) statt Netz-Stream. */
  srcIsLocal?: boolean
  /** Anzahl aufeinanderfolgender gestallter Ticks (Stall-Escape ab MAX_STALLED_TICKS). */
  stalledTicks?: number
}

export type SyncAction =
  | { kind: 'idle' }
  | { kind: 'hold'; playbackRate: 1 }
  | { kind: 'slew'; playbackRate: number }
  | { kind: 'seek'; seekToSec: number; playbackRate: 1 }
  | { kind: 'switch'; trackId: string; seekToSec: number }

/** Tunables des Regelkreises — bewusst an EINER Stelle, dokumentiert, getestet. */
export const SYNC = {
  /** Unter diesem Phasenfehler kein Eingriff (imperceptibel). v2-Fallback, wenn
   *  die v3-Hysterese-Inputs (isSlewing) fehlen. */
  DEADBAND_SEC: 0.75,
  /** Ab diesem Fehler harter Re-Seek statt Tempo-Nudge (großer Versatz).
   *  v2-Fallback, wenn der v3-Input srcIsLocal fehlt. */
  SEEK_MAX_SEC: 6,
  /** v3-Hysterese: Eingriff (Slew) erst ab diesem Fehler ... */
  DEADBAND_ENTER_SEC: 1.0,
  /** ... und zurück zu hold erst unter dieser engeren Schwelle (kein Rate-Flattern). */
  DEADBAND_EXIT_SEC: 0.35,
  /** v3: Seek-Schwelle bei lokaler Blob-Quelle (Seek billig, kein Netz-Stall). */
  SEEK_MAX_LOCAL_SEC: 6,
  /** v3: Seek-Schwelle bei Netz-Quelle (höher — Seek-in-den-Puffer war die Kaskade;
   *  nicht 12, um die Hörer-Divergenz zu deckeln). */
  SEEK_MAX_NETWORK_SEC: 10,
  /** Tempo-Korridor: ±4 % (Tempo-only, preservesPitch=true → praktisch unhörbar). */
  MAX_RATE_DELTA: 0.04,
  /** Proportional-Verstärkung: 1 s Fehler → 4 % Rate (erreicht den Korridor bei 1 s). */
  GAIN_PER_SEC: 0.04,
  /** v3 Stall-Escape: nach so vielen gestallten Ticks hold verlassen und einmalig
   *  normal korrigieren (nie ewig einfrieren). */
  MAX_STALLED_TICKS: 10,
  /** v3.1 Mobile-Continuity: So kurz vor dem Track-Ende wird die Wiedergabe NICHT
   *  mehr angeworfen — dort gehört die Bühne dem Wechsel, sonst startet ein
   *  bereits beendeter Track für Sekundenbruchteile erneut. */
  RESUME_END_GUARD_MS: 500,
  /** ... aber nur so lange, wie die Zeitlinie noch frisch sein kann. Steht
   *  `serverNow` weit hinter `endsAt`, ist die Schedule veraltet (Poll-Ausfall,
   *  eingefrorener Tab) — dann darf der Schutz die Wiedergabe nicht länger
   *  aussperren, sonst hängt ein stehendes Element für immer fest. */
  RESUME_STALE_AFTER_MS: 10_000,
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
  //    v3 Stall-Guard (NUR hier, NACH den Switch-Checks 1–3 — ein Stall darf den
  //    erlösenden Wechsel auf den fertigen Blob nie blockieren): gestalltes Element
  //    nicht zusätzlich seeken/slewen (Seek-in-den-Stall war die Klick-Kaskade).
  //    Escape: nach MAX_STALLED_TICKS trotzdem normal korrigieren.
  const { stalled, isSlewing, srcIsLocal, stalledTicks } = input
  if (stalled && (stalledTicks ?? 0) < SYNC.MAX_STALLED_TICKS) {
    return { kind: 'hold', playbackRate: 1 }
  }

  const error = audioTimeSec - targetPosSec
  const absErr = Math.abs(error)

  // v3 Deadband-Hysterese: im Slew engere Austritts-Schwelle (EXIT), sonst weitere
  // Eintritts-Schwelle (ENTER) — kein 1.0↔1.03-Rate-Flattern im Sekundentakt mehr.
  // Input fehlt → exakt v2 (DEADBAND_SEC).
  const deadbandSec = isSlewing === undefined
    ? SYNC.DEADBAND_SEC
    : (isSlewing ? SYNC.DEADBAND_EXIT_SEC : SYNC.DEADBAND_ENTER_SEC)
  if (absErr < deadbandSec) {
    return { kind: 'hold', playbackRate: 1 }
  }

  // v3 quellenabhängige Seek-Schwelle: Blob lokal → billig (6 s), Netz → höher (10 s,
  // Seek-in-den-Puffer vermeiden). Input fehlt → exakt v2 (SEEK_MAX_SEC).
  const seekMaxSec = srcIsLocal === undefined
    ? SYNC.SEEK_MAX_SEC
    : (srcIsLocal ? SYNC.SEEK_MAX_LOCAL_SEC : SYNC.SEEK_MAX_NETWORK_SEC)

  if (absErr >= seekMaxSec) {
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

/**
 * Mobile-Continuity (v3.1) — die zweite Frage des Regelkreises.
 *
 * `computeSyncAction` beantwortet „steht die Nadel an der richtigen Stelle?".
 * Es beantwortet NICHT „dreht sich der Teller überhaupt?". Genau daran ist die
 * Wiedergabe auf gesperrten Smartphones gestorben: Chrome lehnt im Hintergrund
 * das `play()` nach einem Track-Wechsel ab, das Element bleibt mit korrekt
 * geladener Quelle stehen — und der Regelkreis war zufrieden, weil er danach nur
 * noch die Position korrigierte (ein `seek` auf einem pausierten Element bringt
 * keinen Ton). Der Hörer musste manuell neu einwählen.
 *
 * Diese Regel vergleicht ABSICHT mit BEOBACHTUNG und verlangt einen erneuten
 * Anlauf, sobald beide auseinanderlaufen.
 */
export interface ResumeInput {
  /** Radio-Modus aktiv (im Direkt-Abspiel-Modus entscheidet der Hörer allein). */
  radioMode: boolean
  /** Absicht: es SOLL Ton kommen (play/resume gerufen, kein pause). */
  intendsToPlay: boolean
  /** Beobachtung: das Element spielt tatsächlich. */
  isPlaying: boolean
  /** Eine Quelle ist geladen — ohne Track gibt es nichts anzuwerfen. */
  hasLoadedTrack: boolean
  /** Geschätzte Server-Zeit JETZT (ms). */
  serverNowMs: number
  /** Absolutes Ende der laufenden Track-Instanz (ms, Server-Zeit). */
  endsAtMs: number
}

export function needsPlaybackKick(input: ResumeInput): boolean {
  if (!input.radioMode) return false
  if (!input.intendsToPlay) return false
  if (input.isPlaying) return false
  if (!input.hasLoadedTrack) return false
  // Am Track-Ende übernimmt der Wechsel (siehe computeSyncAction Fall 1) —
  // aber nur, solange die Zeitlinie überhaupt noch aktuell sein kann. Ohne die
  // obere Grenze wäre der Schutz nicht ein Fenster, sondern ein Dauerzustand:
  // jede veraltete Schedule (Poll-Ausfall) hätte den Anlauf für immer
  // abgeschaltet, und ein stehendes Element käme nie wieder in Gang.
  const atTrackEnd =
    input.serverNowMs >= input.endsAtMs - SYNC.RESUME_END_GUARD_MS &&
    input.serverNowMs < input.endsAtMs + SYNC.RESUME_STALE_AFTER_MS
  if (atTrackEnd) return false
  return true
}

/**
 * Dauerstream (ADR-043) — Wartezeit vor dem nächsten Wiederverbindungs-Versuch.
 *
 * Der Sender lebt im Web-Dienst; jeder Deploy reißt darum jede Verbindung ab.
 * Der Client muss das selbst auffangen, sonst bleibt es nach einem Neustart
 * still, bis jemand die Seite neu lädt.
 *
 * Die Wartezeit verdoppelt sich mit jedem Fehlversuch und ist gedeckelt. Grund:
 * Ein Deploy dauert ein paar Sekunden — da soll es schnell wieder anspringen.
 * Ist der Server dagegen länger weg, würde ein starrer Sekundentakt von vielen
 * Geräten gleichzeitig zur Anfrage-Flut, die den Start zusätzlich behindert.
 */
export const STREAM_RECONNECT = {
  BASE_MS: 1_000,
  MAX_MS: 15_000,
} as const

export function reconnectDelayMs(attempt: number): number {
  if (attempt <= 0) return 0
  const grown = STREAM_RECONNECT.BASE_MS * 2 ** (attempt - 1)
  return Math.min(grown, STREAM_RECONNECT.MAX_MS)
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
