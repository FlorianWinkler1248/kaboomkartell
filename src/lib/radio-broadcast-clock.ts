/**
 * Sender-Regelgesetz — wann greift der Dauerstream zum nächsten Titel?
 * (rein, ohne Dateisystem und Datenbank, deshalb im CI deterministisch testbar)
 *
 * MENTALES MODELL
 * ---------------
 * Der Sender läuft der Wanduhr absichtlich voraus: Was er jetzt in die Leitung
 * schiebt, hört sein Publikum erst ein paar Sekunden später — genau dieser
 * Vorlauf ist der Puffer, aus dem ein hakendes Mobilfunk-Netz zehrt.
 *
 * Daraus folgt die Regel, an der die erste Fassung scheiterte: An der
 * Titel-Grenze darf der Sender NICHT fragen „was läuft jetzt?", sondern muss
 * fragen „was läuft, wenn diese Bytes ankommen?". Wer die Wanduhr fragt,
 * bekommt den Titel genannt, den er selbst gerade zu Ende gesendet hat — beim
 * Publikum spielt er ja noch. Genau so geriet der Ton hinter die Anzeige und
 * begann Titel ein zweites Mal (13.08.2026).
 *
 * DIE ZWEITE SICHERUNG
 * --------------------
 * Die Vorlauf-Rechnung allein genügt nicht: Verschluckt der Server einen Takt
 * oder liegt eine Titel-Dauer in der Datenbank knapp neben der Datei, kann die
 * Frage trotzdem eine Sekunde zu früh kommen. Deshalb erkennt der Sender die
 * ANTWORT wieder. Nicht am Titel — derselbe Titel darf später erneut laufen —,
 * sondern am Durchlauf: Titel-Kennung plus Startzeitpunkt dieses Durchlaufs.
 * Kommt derselbe Durchlauf zurück, den er eben beendet hat, wartet er einen
 * Takt und fragt erneut, statt ihn von vorn zu beginnen.
 *
 * WARUM IMMER ANSPULEN
 * --------------------
 * Der Sender beginnt jeden Titel an der Stelle, die das Programm für den
 * Aussende-Zeitpunkt nennt — auch den zweiten und jeden weiteren. Vorher galt
 * das nur für den allerersten; alle folgenden begannen bei Byte null und der
 * Sender wurde damit zu einer zweiten, freilaufenden Uhr neben der des
 * Programms. Zwei Uhren ohne Kopplung laufen zwangsläufig auseinander. Mit dem
 * Anspulen an jeder Grenze holt sich der Sender das Programm bei jedem Titel
 * neu als Taktgeber — ein Versatz kann sich nicht mehr aufsummieren.
 */

/** Toleranz, innerhalb derer zwei Zeitangaben denselben Durchlauf meinen (ms).
 *
 *  Die Startzeit eines Durchlaufs wird aus Server-Zeit minus Position
 *  zurückgerechnet und schwankt deshalb um Bruchteile einer Sekunde. Fünf
 *  Sekunden liegen weit über diesem Rauschen und weit unter dem Abstand zweier
 *  echter Durchläufe desselben Titels (mindestens eine Titel-Länge). */
const SAME_RUN_TOLERANCE_MS = 5_000

/**
 * Wie weit ist der Sender der Wanduhr voraus (Sekunden)?
 *
 * Gemessen statt angenommen: Die Differenz aus ausgegebener Spielzeit und
 * vergangener Wanduhr-Zeit ist der tatsächliche Vorlauf. Beim allerersten Takt
 * ist er null — der Sender steigt dann an der Live-Position ein, ohne in die
 * Zukunft zu greifen.
 */
export function sendAheadSeconds(input: {
  /** Wanduhr jetzt (ms). */
  nowMs: number
  /** Wanduhr-Anker, seit dem der Sender ausgibt (ms). */
  clockStartMs: number
  /** Ausgegebene Spielzeit seit dem Anker (Sekunden). */
  deliveredSeconds: number
}): number {
  const elapsedSeconds = (input.nowMs - input.clockStartMs) / 1000
  const ahead = input.deliveredSeconds - elapsedSeconds
  return ahead > 0 ? ahead : 0
}

/** Ein Titel-Durchlauf: dieselbe Kennung kann später erneut laufen, derselbe
 *  Durchlauf nicht. */
export interface TrackRun {
  trackId: string
  /** Beginn dieses Durchlaufs in Server-Zeit (ms). */
  startedAtMs: number
}

export type TrackDecision =
  /** Titel laden und an dieser Stelle beginnen. */
  | { kind: 'play'; run: TrackRun; startAtSeconds: number }
  /** Die Antwort ist noch der eben beendete Durchlauf — einen Takt warten. */
  | { kind: 'wait' }
  /** Der Channel sendet gerade nicht. */
  | { kind: 'offair' }

/**
 * Was tut der Sender an der Titel-Grenze?
 *
 * `programPositionSeconds` ist die Stelle, an der das Programm den Titel zum
 * AUSSENDE-Zeitpunkt sieht — der Aufrufer hat die Programm-Hoheit also bereits
 * mit der um den Vorlauf verschobenen Uhr befragt.
 */
export function decideNextTrack(input: {
  /** Durchlauf, den der Sender gerade fertig ausgegeben hat (null beim Start). */
  finishedRun: TrackRun | null
  /** Titel, den das Programm für den Aussende-Zeitpunkt meldet (null = Off-Air). */
  programTrackId: string | null
  /** Position dieses Titels zum Aussende-Zeitpunkt (Sekunden). */
  programPositionSeconds: number
  /** Server-Zeit, auf die sich die Position bezieht (ms). */
  programNowMs: number
}): TrackDecision {
  if (!input.programTrackId) return { kind: 'offair' }

  // Startzeitpunkt dieses Durchlaufs zurückrechnen — er unterscheidet zwei
  // Durchläufe desselben Titels zuverlässig, die Titel-Kennung allein nicht.
  const startedAtMs = input.programNowMs - input.programPositionSeconds * 1000

  const finished = input.finishedRun
  if (
    finished &&
    finished.trackId === input.programTrackId &&
    Math.abs(finished.startedAtMs - startedAtMs) <= SAME_RUN_TOLERANCE_MS
  ) {
    return { kind: 'wait' }
  }

  return {
    kind: 'play',
    run: { trackId: input.programTrackId, startedAtMs },
    startAtSeconds: input.programPositionSeconds > 0 ? input.programPositionSeconds : 0,
  }
}
