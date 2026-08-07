/**
 * MP3-Rahmen-Werkzeug für den Dauerstream (rein, ohne Dateisystem).
 *
 * WARUM DAS NÖTIG IST
 * -------------------
 * Der Dauerstream hängt mehrere MP3-Dateien zu EINER endlosen Antwort
 * aneinander. Ein MP3-Dekoder verkraftet das problemlos — er liest ohnehin
 * Rahmen für Rahmen und verträgt sogar wechselnde Bitraten. Zwei Dinge stören
 * ihn aber:
 *
 *  1. **Der ID3-Block am Dateianfang.** Suno-Exporte tragen dort Titel, Cover
 *     und Kommentare — bei einem einzelnen Download harmlos, mitten im Strom
 *     jedoch Ballast, den manche Dekoder als kaputte Rahmen deuten (hörbar als
 *     Knacken am Übergang).
 *  2. **Der Xing/Info-Rahmen.** Der erste Rahmen einer VBR-Datei enthält keine
 *     Musik, sondern die Dauer- und Index-Tabelle. Mitten im Strom ist er ein
 *     Bruchteil einer Sekunde Stille — und schlimmer: manche Dekoder deuten ihn
 *     als neuen Datei-Anfang und setzen ihre Positionsanzeige zurück.
 *
 * Beides wird hier erkannt und übersprungen. Zusätzlich findet
 * `findFrameStart` den nächsten echten Rahmen-Anfang — nötig, wenn ein Hörer
 * mitten im Titel dazustößt und wir an einer beliebigen Byte-Position einsteigen
 * müssten. Ohne diese Ausrichtung beginnt die Wiedergabe mit einem halben
 * Rahmen, was als kurzer Knack hörbar ist.
 *
 * Alle Funktionen sind pur und arbeiten auf `Uint8Array` — damit ohne Server
 * testbar (wie `player-queue.ts` und `radio-sync-control.ts`).
 */

/** Ein MPEG-Audio-Rahmen beginnt mit 11 gesetzten Bits (Frame-Sync). */
function isFrameSync(buf: Uint8Array, i: number): boolean {
  return i + 1 < buf.length && buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0
}

/**
 * Länge des ID3v2-Blocks am Dateianfang (0, wenn keiner da ist).
 *
 * Aufbau: "ID3" + 2 Byte Version + 1 Byte Flags + 4 Byte Größe. Die Größe steht
 * als „synchsafe integer" — pro Byte werden nur 7 Bit genutzt, damit im Block
 * nie zufällig ein Frame-Sync-Muster entsteht.
 */
export function id3v2Length(buf: Uint8Array): number {
  if (buf.length < 10) return 0
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0 // "ID3"
  const size =
    ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
  const footer = (buf[5] & 0x10) !== 0 ? 10 : 0
  return 10 + size + footer
}

/**
 * Nächster Rahmen-Anfang ab `from` — oder -1, wenn keiner mehr im Puffer liegt.
 *
 * Bewusst nur die Sync-Erkennung, keine vollständige Header-Prüfung: ein
 * falsch-positiver Treffer kostet einen einzigen verworfenen Rahmen, während
 * eine strenge Prüfung bei ungewöhnlichen Kodierungen gar keinen Einstieg mehr
 * fände. Für den Zweck — sauber einsteigen statt mitten im Rahmen — reicht das.
 */
export function findFrameStart(buf: Uint8Array, from = 0): number {
  for (let i = Math.max(0, from); i < buf.length - 1; i++) {
    if (isFrameSync(buf, i)) return i
  }
  return -1
}

/** Bitraten-Tabelle für MPEG-1 Layer III (kbit/s), Index 0 und 15 sind ungültig. */
const BITRATES_V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
/** Abtastraten für MPEG-1 (Hz). */
const SAMPLERATES_V1 = [44100, 48000, 32000, 0]

export interface FrameHeader {
  /** Länge dieses Rahmens in Bytes (inklusive Header). */
  frameLength: number
  bitrateKbps: number
  sampleRate: number
  /** Ist der Kanal-Modus Mono? (bestimmt, wo der Xing-Marker steht) */
  mono: boolean
}

/**
 * Header eines Rahmens auslesen. Liefert null, wenn an der Stelle kein
 * brauchbarer MPEG-1-Layer-III-Rahmen steht.
 */
export function readFrameHeader(buf: Uint8Array, at: number): FrameHeader | null {
  if (at + 3 >= buf.length) return null
  if (!isFrameSync(buf, at)) return null

  const versionBits = (buf[at + 1] >> 3) & 0x03 // 3 = MPEG-1
  const layerBits = (buf[at + 1] >> 1) & 0x03 // 1 = Layer III
  if (versionBits !== 3 || layerBits !== 1) return null

  const bitrateKbps = BITRATES_V1L3[(buf[at + 2] >> 4) & 0x0f]
  const sampleRate = SAMPLERATES_V1[(buf[at + 2] >> 2) & 0x03]
  if (!bitrateKbps || !sampleRate) return null

  const padding = (buf[at + 2] >> 1) & 0x01
  const mono = ((buf[at + 3] >> 6) & 0x03) === 3
  // Layer III, MPEG-1: 1152 Samples pro Rahmen → 144 * Bitrate / Abtastrate.
  const frameLength = Math.floor((144 * bitrateKbps * 1000) / sampleRate) + padding

  return { frameLength, bitrateKbps, sampleRate, mono }
}

/**
 * Trägt der Rahmen an `at` einen Xing-/Info-/VBRI-Marker? Dann enthält er keine
 * Musik, sondern die VBR-Tabelle und gehört im Strom übersprungen.
 *
 * Der Marker sitzt nach dem 4-Byte-Header plus einem Abstand, der vom
 * Kanal-Modus abhängt (Mono 17 Byte, Stereo 32 Byte).
 */
export function isXingFrame(buf: Uint8Array, at: number, header: FrameHeader): boolean {
  const offset = at + 4 + (header.mono ? 17 : 32)
  if (offset + 4 > buf.length) return false
  const tag = String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3])
  return tag === 'Xing' || tag === 'Info' || tag === 'VBRI'
}

/**
 * Byte-Position, ab der die eigentliche Musik einer Datei beginnt.
 *
 * Überspringt den ID3-Block, richtet auf den ersten Rahmen aus und lässt einen
 * Xing-/Info-Rahmen aus. Das Ergebnis ist der Punkt, ab dem man Bytes in einen
 * laufenden Strom schieben kann, ohne dass ein Dekoder stolpert.
 */
export function audioStartOffset(buf: Uint8Array): number {
  const afterId3 = id3v2Length(buf)
  const first = findFrameStart(buf, afterId3)
  if (first < 0) return afterId3

  const header = readFrameHeader(buf, first)
  if (header && isXingFrame(buf, first, header)) {
    return first + header.frameLength
  }
  return first
}

/**
 * Mittlere Bytes pro Sekunde einer Datei — der Takt, in dem der Sender die
 * Bytes ausgeben muss.
 *
 * Bewusst aus Dateigröße und Spieldauer gemittelt statt aus der Bitrate des
 * ersten Rahmens: KBK-Titel sind variabel kodiert (Suno), einzelne Rahmen
 * schwanken stark. Über einen ganzen Titel gemittelt stimmt das Tempo, und
 * kleine Abweichungen fängt der Puffer des Hörers ab.
 */
export function averageBytesPerSecond(audioByteLength: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0
  return audioByteLength / durationSeconds
}
