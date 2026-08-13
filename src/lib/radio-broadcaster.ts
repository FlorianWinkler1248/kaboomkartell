/**
 * Dauerstream — der Sender pro Channel (SERVER-ONLY: fs + prisma).
 *
 * MENTALES MODELL
 * ---------------
 * Bisher lud jeder Browser die Titel als einzelne Dateien und hängte sie selbst
 * aneinander. Das braucht laufendes JavaScript an jeder Track-Grenze — und genau
 * das friert ein gesperrtes Handy ein. Der Sender dreht das um: Er hält pro
 * Channel EINE endlose Antwort offen und schiebt die Titel nacheinander hinein.
 * Der Browser sieht nie ein Track-Ende und braucht für die Kontinuität kein
 * einziges Stück Skript. Genau so arbeitet Internet-Radio seit jeher.
 *
 * WER BESTIMMT, WAS LÄUFT
 * -----------------------
 * Nicht der Sender. Die Programm-Hoheit bleibt bei `radio-state.ts` — dort
 * werden Kandidaten gewählt, Stimmen gezählt und der Gewinner gelockt
 * (Crowd Control). Der Sender FRAGT an jeder Track-Grenze, was läuft, und
 * spielt genau das. Das Voting läuft dadurch unverändert weiter.
 *
 * Gefragt wird dabei für den Moment, in dem die Bytes ANKOMMEN — nicht für die
 * Wanduhr. Der Sender liegt um seinen Vorlauf vor dem Publikum; fragte er nach
 * dem Jetzt, nennte ihm das Programm an jeder Grenze den Titel, den er selbst
 * gerade zu Ende gesendet hat. Das Regelgesetz dazu steht als reine, testbare
 * Einheit in `radio-broadcast-clock.ts`.
 *
 * WARUM RAHMENGENAU UND NICHT NACH BYTES
 * --------------------------------------
 * Ein MP3-Rahmen trägt immer exakt 1152 Samples — bei 44,1 kHz also 26,12 ms
 * Musik, ganz gleich wie viele Bytes er belegt. KBK-Titel sind variabel kodiert
 * (Suno): dichte Passagen brauchen deutlich mehr Bytes pro Sekunde als leise.
 * Wer nach mittlerer Bitrate sendet, liefert in lauten Stellen zu wenig nach —
 * der Puffer des Hörers läuft leer und es stockt. Nach Rahmen gerechnet stimmt
 * das Tempo immer.
 *
 * Und weil die Menge am VERGANGENEN Wanduhr-Zeitraum gemessen wird (nicht an der
 * Zahl der Takte), kann sich über Stunden kein Versatz aufbauen: verschluckt der
 * Server einen Takt, holt der nächste ihn automatisch auf.
 *
 * DAZUSTOSSEN
 * -----------
 * Neue Hörer bekommen zuerst den Rückstau der letzten Sekunden, damit die
 * Wiedergabe sofort anläuft statt am leeren Puffer zu hängen. Danach hängen sie
 * am selben Live-Rand wie alle anderen — synchron ohne Seek, ohne Regelkreis
 * und vor allem ohne Tempo-Korrektur.
 */

import fs from 'fs/promises'
import prisma from './db'
import { getAbsolutePath } from './storage'
import { audioStartOffset, findFrameStart, readFrameHeader } from './mp3-frames'
import { loadRadioData, readNowPlayingState, readGrace, isCrowdControlEnabled } from './radio-state'
import { getActiveContext, getNowPlaying, type NowPlayingResult } from './radio'
import { sendAheadSeconds, decideNextTrack, type TrackRun } from './radio-broadcast-clock'

/** Sende-Takt. 250 ms hält die Timer-Last niedrig und den Rückstau klein. */
const TICK_MS = 250
/**
 * Vorlauf, den der Sender gegenüber der Wanduhr hält.
 *
 * Das ist der Puffer, aus dem der Hörer zehrt, wenn das Mobilfunk-Netz kurz
 * hakt. Großzügig gewählt: 8 Sekunden Verzögerung merkt bei einem Radio
 * niemand — ein Aussetzer sehr wohl. Alle Hörer liegen gleich weit zurück,
 * die Sync-Invariante bleibt also unberührt.
 */
const LEAD_SECONDS = 8
/** Rückstau für Neuzugänge — so viel Audio bekommen sie sofort. */
const BURST_SECONDS = 6
/** Ohne Hörer schläft der Sender. Kurze Nachlaufzeit, damit ein Seiten-Neuladen
 *  den Titel nicht von vorn beginnen lässt. */
const IDLE_SHUTDOWN_MS = 30_000
/** Samples pro MPEG-1-Layer-III-Rahmen — fest, unabhängig von der Bitrate. */
const SAMPLES_PER_FRAME = 1152

interface Listener {
  push: (chunk: Uint8Array) => void
}

interface LoadedTrack {
  run: TrackRun
  data: Buffer
  /** Lese-Position im Puffer (steht immer auf einem Rahmen-Anfang). */
  cursor: number
}

/** Ergebnis eines Lade-Versuchs — der Sende-Takt reagiert auf jeden Fall anders. */
type LoadStatus = 'loaded' | 'wait' | 'offair'

class ChannelBroadcaster {
  private listeners = new Set<Listener>()
  private timer: ReturnType<typeof setInterval> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private track: LoadedTrack | null = null
  /** Zuletzt begonnener Durchlauf — daran erkennt der Sender an der Grenze, ob
   *  das Programm ihm den eben beendeten Titel erneut nennt. */
  private lastRun: TrackRun | null = null
  private backlog: { chunk: Uint8Array; seconds: number }[] = []
  private backlogSeconds = 0
  private loading = false
  /** Wanduhr-Anker und wie viel Musik seitdem ausgegeben wurde (Sekunden). */
  private clockStartMs = 0
  private deliveredSeconds = 0

  constructor(private readonly channel: string) {}

  get listenerCount(): number {
    return this.listeners.size
  }

  add(listener: Listener): void {
    this.listeners.add(listener)
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    for (const entry of this.backlog) listener.push(entry.chunk)
    this.start()
  }

  remove(listener: Listener): void {
    this.listeners.delete(listener)
    if (this.listeners.size === 0 && !this.idleTimer) {
      this.idleTimer = setTimeout(() => this.stop(), IDLE_SHUTDOWN_MS)
    }
  }

  private start(): void {
    if (this.timer) return
    this.clockStartMs = Date.now()
    this.deliveredSeconds = 0
    this.timer = setInterval(() => {
      void this.tick()
    }, TICK_MS)
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.idleTimer = null
    this.track = null
    this.lastRun = null
    this.backlog = []
    this.backlogSeconds = 0
  }

  /** Ein Sende-Takt: so viele Rahmen ausgeben, wie die Wanduhr verlangt. */
  private async tick(): Promise<void> {
    if (this.listeners.size === 0 || this.loading) return

    const elapsedSeconds = (Date.now() - this.clockStartMs) / 1000
    const targetSeconds = elapsedSeconds + LEAD_SECONDS

    // Sicherheitsnetz: nie mehr als ein paar Sekunden am Stück ausgeben. Sonst
    // würde ein pausierter Prozess (Suspend, langer GC) beim Aufwachen einen
    // Schwall Audio in die Leitung drücken.
    const maxPerTick = LEAD_SECONDS
    let budget = Math.min(targetSeconds - this.deliveredSeconds, maxPerTick)
    if (budget <= 0) return

    while (budget > 0) {
      if (!this.track || this.track.cursor >= this.track.data.length) {
        this.loading = true
        let status: LoadStatus = 'offair'
        try {
          status = await this.loadCurrentTrack()
        } catch (err) {
          console.error(`[radio-broadcaster:${this.channel}] Laden fehlgeschlagen:`, err)
          this.track = null
        } finally {
          this.loading = false
        }
        // Das Programm nennt noch den eben beendeten Durchlauf: einen Takt
        // warten und erneut fragen. Der Vorlauf bleibt dabei ABSICHTLICH
        // stehen — würde er hier zurückgesetzt, fragte der nächste Versuch
        // wieder die Wanduhr und liefe in denselben Fehler.
        if (status === 'wait') return
        // Nichts zu senden (Off-Air): Uhr mitziehen, damit der Sender danach
        // nicht aufzuholen versucht.
        if (!this.track) {
          this.deliveredSeconds = targetSeconds - LEAD_SECONDS
          return
        }
      }

      const sent = this.emitFrames(budget)
      if (sent <= 0) {
        // Kein lesbarer Rahmen mehr — Datei ist zu Ende oder beschädigt.
        this.track = null
        continue
      }
      budget -= sent
      this.deliveredSeconds += sent
    }
  }

  /**
   * Gibt ganze Rahmen aus, bis das Sekunden-Budget aufgebraucht ist.
   * Liefert die tatsächlich gesendete Spielzeit zurück.
   *
   * Es werden IMMER vollständige Rahmen geschickt — ein halber Rahmen ist genau
   * das, was als Knacken hörbar wird.
   */
  private emitFrames(budgetSeconds: number): number {
    const track = this.track
    if (!track) return 0

    const start = track.cursor
    let seconds = 0

    while (seconds < budgetSeconds && track.cursor < track.data.length) {
      const header = readFrameHeader(track.data, track.cursor)
      if (!header) {
        // Ausgerutscht (Tag mitten in der Datei, beschädigte Stelle): nächsten
        // echten Rahmen suchen statt Müll zu senden.
        const next = findFrameStart(track.data, track.cursor + 1)
        if (next < 0) {
          track.cursor = track.data.length
          break
        }
        track.cursor = next
        continue
      }
      track.cursor += header.frameLength
      seconds += SAMPLES_PER_FRAME / header.sampleRate
    }

    if (track.cursor <= start) return 0
    const chunk = new Uint8Array(track.data.subarray(start, Math.min(track.cursor, track.data.length)))
    this.remember(chunk, seconds)
    for (const listener of [...this.listeners]) {
      try {
        listener.push(chunk)
      } catch {
        this.remove(listener)
      }
    }
    return seconds
  }

  /** Rückstau der letzten BURST_SECONDS vorhalten (nach Spielzeit, nicht Bytes).
   *
   *  Jedes Paket trägt seine eigene Spielzeit mit — die Pakete sind NICHT gleich
   *  lang: das erste enthält den ganzen Vorlauf (8 s), die folgenden je einen
   *  Takt (0,25 s). Zöge man pauschal die Dauer des neuesten Pakets ab, liefe
   *  der Zähler nach dem ersten Schwall aus dem Tritt und der Rückstau leerte
   *  sich vollständig — Neuzugänge bekämen dann keinen Puffer und würden
   *  stocken. */
  private remember(chunk: Uint8Array, seconds: number): void {
    this.backlog.push({ chunk, seconds })
    this.backlogSeconds += seconds
    while (this.backlogSeconds > BURST_SECONDS && this.backlog.length > 1) {
      const dropped = this.backlog.shift()
      if (dropped) this.backlogSeconds -= dropped.seconds
    }
  }

  /**
   * Was läuft auf diesem Channel zum Zeitpunkt `now`? Dieselbe Kaskade wie die
   * `now-playing`-Route — Crowd Control zuerst, dann Grace, dann der
   * deterministische Pfad. Bewusst identisch: Sender und Metadaten-Abfrage
   * müssen dieselbe Antwort geben, sonst zeigt die Leiste einen anderen Titel
   * als der Ton.
   *
   * `now` ist bewusst ein Parameter und nicht die Wanduhr: Der Sender fragt für
   * den Moment, in dem die Bytes beim Publikum ankommen — also um seinen
   * Vorlauf in der Zukunft (siehe `loadCurrentTrack`).
   */
  private async resolveNowPlaying(now: Date): Promise<NowPlayingResult | null> {
    const { radioSlots, radioEvents, poolMap } = await loadRadioData(now)

    if (isCrowdControlEnabled()) {
      try {
        const ctx = getActiveContext(radioSlots, radioEvents, poolMap, now, this.channel)
        if (ctx) {
          const res = await readNowPlayingState(
            ctx, poolMap.get(ctx.poolId) ?? null, now, this.channel, poolMap,
          )
          if (res) return res
        }
        const grace = await readGrace(this.channel, now, poolMap)
        if (grace) return grace
      } catch (err) {
        console.error(`[radio-broadcaster:${this.channel}] Crowd-Control-Pfad fehlgeschlagen:`, err)
      }
    }
    return getNowPlaying(radioSlots, radioEvents, poolMap, now, this.channel)
  }

  /**
   * Fragt die Programm-Hoheit, was läuft, und lädt die Datei.
   *
   * Gefragt wird für den AUSSENDE-Zeitpunkt, nicht für die Wanduhr: Was der
   * Sender jetzt in die Leitung schiebt, hört das Publikum erst um den Vorlauf
   * später. Wer hier die Wanduhr fragt, bekommt an der Titel-Grenze den Titel
   * genannt, den er selbst gerade zu Ende gesendet hat — und beginnt ihn ein
   * zweites Mal. Genau so geriet der Ton hinter die Anzeige (13.08.2026).
   *
   * Angespult wird bei JEDEM Titel auf die Position, die das Programm nennt.
   * Damit ist das Programm an jeder Grenze wieder der Taktgeber und ein Versatz
   * kann sich nicht über die Stunden aufsummieren.
   */
  private async loadCurrentTrack(): Promise<LoadStatus> {
    const nowMs = Date.now()
    const ahead = sendAheadSeconds({
      nowMs,
      clockStartMs: this.clockStartMs,
      deliveredSeconds: this.deliveredSeconds,
    })
    const sendTimeMs = nowMs + ahead * 1000
    const np = await this.resolveNowPlaying(new Date(sendTimeMs))

    const decision = decideNextTrack({
      finishedRun: this.lastRun,
      programTrackId: np?.track?.id ?? null,
      programPositionSeconds: np?.positionSeconds ?? 0,
      programNowMs: sendTimeMs,
    })

    if (decision.kind === 'wait') return 'wait'
    if (decision.kind === 'offair') {
      this.track = null
      this.lastRun = null
      return 'offair'
    }

    // Der Programm-Zustand liefert nur die Stream-URL, nicht den Dateipfad —
    // den holen wir direkt, weil wir die Bytes selbst lesen.
    const row = await prisma.track.findUnique({
      where: { id: decision.run.trackId },
      select: { filePath: true },
    })
    if (!row?.filePath) {
      this.track = null
      this.lastRun = null
      return 'offair'
    }

    const data = await fs.readFile(getAbsolutePath(row.filePath))
    const audioStart = audioStartOffset(data)
    const cursor = decision.startAtSeconds > 0
      ? this.frameAtSecond(data, audioStart, decision.startAtSeconds)
      : audioStart

    this.track = { run: decision.run, data, cursor }
    this.lastRun = decision.run
    return 'loaded'
  }

  /**
   * Rahmen-Anfang, der einer Spielzeit-Position am nächsten liegt.
   *
   * Rahmenweise gezählt statt über die mittlere Bitrate geschätzt: Das ist bei
   * variabel kodierten Dateien deutlich genauer und landet garantiert auf einem
   * Rahmen-Anfang statt mittendrin — ein halber Rahmen wäre als Knacken hörbar.
   */
  private frameAtSecond(data: Buffer, audioStart: number, targetSeconds: number): number {
    let seconds = 0
    let at = audioStart
    while (seconds < targetSeconds && at < data.length) {
      const header = readFrameHeader(data, at)
      if (!header) {
        const next = findFrameStart(data, at + 1)
        if (next < 0) break
        at = next
        continue
      }
      at += header.frameLength
      seconds += SAMPLES_PER_FRAME / header.sampleRate
    }
    return Math.min(at, data.length)
  }
}

/** Ein Sender pro Channel, über Modul-Neuladen hinweg stabil (HMR im Dev). */
const globalForBroadcast = globalThis as unknown as {
  kbkBroadcasters?: Map<string, ChannelBroadcaster>
}
const broadcasters = globalForBroadcast.kbkBroadcasters ?? new Map<string, ChannelBroadcaster>()
globalForBroadcast.kbkBroadcasters = broadcasters

export function getBroadcaster(channel: string): ChannelBroadcaster {
  let b = broadcasters.get(channel)
  if (!b) {
    b = new ChannelBroadcaster(channel)
    broadcasters.set(channel, b)
  }
  return b
}

export type { Listener as BroadcastListener }
