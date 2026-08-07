/**
 * Tests für das MP3-Rahmen-Werkzeug des Dauerstreams.
 * Lauf: pnpm exec vitest run src/lib/__tests__/mp3-frames.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  id3v2Length, findFrameStart, readFrameHeader, isXingFrame,
  audioStartOffset, averageBytesPerSecond,
} from '../mp3-frames'

/** Baut einen MPEG-1-Layer-III-Rahmen-Header.
 *  bitrateIndex 9 = 128 kbit/s, sampleIndex 0 = 44100 Hz. */
function frameHeader({ bitrateIndex = 9, sampleIndex = 0, padding = 0, mono = false } = {}): number[] {
  return [
    0xff,
    0xfb, // MPEG-1 (11), Layer III (01), kein CRC
    (bitrateIndex << 4) | (sampleIndex << 2) | (padding << 1),
    mono ? 0xc0 : 0x00, // Kanal-Modus: 11 = Mono, 00 = Stereo
  ]
}

/** ID3v2-Block mit `payload` Nutz-Bytes (synchsafe kodierte Größe). */
function id3(payload: number): number[] {
  const size = [
    (payload >> 21) & 0x7f, (payload >> 14) & 0x7f, (payload >> 7) & 0x7f, payload & 0x7f,
  ]
  return [0x49, 0x44, 0x33, 3, 0, 0, ...size, ...new Array(payload).fill(0)]
}

describe('ID3-Block', () => {
  it('erkennt die Länge eines ID3v2-Blocks', () => {
    expect(id3v2Length(new Uint8Array(id3(100)))).toBe(110) // 10 Header + 100 Nutzlast
  })

  it('liefert 0, wenn keiner da ist', () => {
    expect(id3v2Length(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe(0)
  })

  it('liefert 0 bei zu kurzem Puffer', () => {
    expect(id3v2Length(new Uint8Array([0x49, 0x44]))).toBe(0)
  })
})

describe('Rahmen finden', () => {
  it('findet den Rahmen-Anfang hinter Füll-Bytes', () => {
    const buf = new Uint8Array([0x00, 0x00, 0x00, ...frameHeader()])
    expect(findFrameStart(buf)).toBe(3)
  })

  it('liefert -1, wenn kein Rahmen im Puffer liegt', () => {
    expect(findFrameStart(new Uint8Array([0x00, 0x01, 0x02]))).toBe(-1)
  })

  it('sucht ab der angegebenen Position weiter', () => {
    const buf = new Uint8Array([...frameHeader(), ...frameHeader()])
    expect(findFrameStart(buf, 1)).toBe(4)
  })
})

describe('Rahmen-Header lesen', () => {
  it('rechnet die Rahmen-Länge aus Bitrate und Abtastrate', () => {
    const h = readFrameHeader(new Uint8Array(frameHeader()), 0)
    // 144 * 128000 / 44100 = 417,9… → 417 Bytes, ohne Padding
    expect(h).not.toBeNull()
    expect(h!.frameLength).toBe(417)
    expect(h!.bitrateKbps).toBe(128)
    expect(h!.sampleRate).toBe(44100)
    expect(h!.mono).toBe(false)
  })

  it('zählt das Padding-Bit mit', () => {
    const h = readFrameHeader(new Uint8Array(frameHeader({ padding: 1 })), 0)
    expect(h!.frameLength).toBe(418)
  })

  it('erkennt Mono', () => {
    expect(readFrameHeader(new Uint8Array(frameHeader({ mono: true })), 0)!.mono).toBe(true)
  })

  it('verweigert ungültige Bitraten-Indizes', () => {
    expect(readFrameHeader(new Uint8Array(frameHeader({ bitrateIndex: 0 })), 0)).toBeNull()
    expect(readFrameHeader(new Uint8Array(frameHeader({ bitrateIndex: 15 })), 0)).toBeNull()
  })

  it('liefert null ohne Frame-Sync', () => {
    expect(readFrameHeader(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 0)).toBeNull()
  })
})

describe('Xing-Rahmen', () => {
  /** Rahmen mit Xing-Marker an der Stereo-Position (4 + 32). */
  function xingFrame(tag = 'Xing'): number[] {
    const f = [...frameHeader(), ...new Array(32).fill(0)]
    for (const c of tag) f.push(c.charCodeAt(0))
    return f
  }

  it('erkennt Xing, Info und VBRI', () => {
    for (const tag of ['Xing', 'Info', 'VBRI']) {
      const buf = new Uint8Array(xingFrame(tag))
      const h = readFrameHeader(buf, 0)!
      expect(isXingFrame(buf, 0, h)).toBe(true)
    }
  })

  it('erkennt einen normalen Musik-Rahmen NICHT als Xing', () => {
    const buf = new Uint8Array([...frameHeader(), ...new Array(40).fill(0x42)])
    const h = readFrameHeader(buf, 0)!
    expect(isXingFrame(buf, 0, h)).toBe(false)
  })
})

describe('Einstiegspunkt in die Musik', () => {
  it('überspringt ID3-Block UND Xing-Rahmen', () => {
    const xing = [...frameHeader(), ...new Array(32).fill(0), 0x58, 0x69, 0x6e, 0x67] // "Xing"
    const buf = new Uint8Array([...id3(50), ...xing, ...new Array(400).fill(0), ...frameHeader()])
    // ID3 = 60 Bytes, danach der Xing-Rahmen mit 417 Bytes Länge → Musik ab 477.
    expect(audioStartOffset(buf)).toBe(60 + 417)
  })

  it('überspringt nur den ID3-Block, wenn kein Xing folgt', () => {
    const buf = new Uint8Array([...id3(20), ...frameHeader(), ...new Array(40).fill(0x42)])
    expect(audioStartOffset(buf)).toBe(30)
  })

  it('kommt ohne ID3 und ohne Xing direkt auf 0', () => {
    const buf = new Uint8Array([...frameHeader(), ...new Array(40).fill(0x42)])
    expect(audioStartOffset(buf)).toBe(0)
  })

  it('fällt auf das ID3-Ende zurück, wenn gar kein Rahmen folgt', () => {
    const buf = new Uint8Array(id3(10))
    expect(audioStartOffset(buf)).toBe(20)
  })
})

describe('Sende-Tempo', () => {
  it('mittelt Bytes pro Sekunde über den ganzen Titel', () => {
    // 3 MB auf 120 s ≈ 26214 B/s ≈ 210 kbit/s
    expect(Math.round(averageBytesPerSecond(3_145_728, 120))).toBe(26214)
  })

  it('liefert 0 bei unbekannter Dauer, statt durch null zu teilen', () => {
    expect(averageBytesPerSecond(1000, 0)).toBe(0)
    expect(averageBytesPerSecond(1000, -5)).toBe(0)
  })
})
