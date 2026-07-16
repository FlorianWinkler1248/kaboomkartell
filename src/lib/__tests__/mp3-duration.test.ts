// Vitest-Spec für die MP3-Duration-Extraktion (mp3-duration.ts, v3 vom 16.07.2026).
// Baut synthetische MPEG1-Layer-III-Dateien programmatisch (keine Binär-Fixtures im Repo)
// und prüft die drei Verteidigungslinien:
//   1. Xing/Info-Frame-Count (Suche auf den ersten validierten Frame begrenzt)
//   2. voller Frame-Walk (VBR OHNE Xing-Header — neue Suno-Variante, Vorfall 16.07.2026:
//      erster Frame trägt 320 kbps, die alte CBR-Schätzung lag ~45% zu kurz)
//   3. Fehlerfälle (kaputte/leere Datei → throw bzw. null)
// Läuft mit `pnpm test`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getMp3DurationFromPath, tryGetMp3Duration } from '../mp3-duration'

// MPEG1-Layer-III-Bitrate-Tabelle (kbps) — Index = Bitrate-Index im Frame-Header.
const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const MPEG1_SAMPLE_RATES = [44100, 48000, 32000]
const MPEG2_SAMPLE_RATES = [22050, 24000, 16000]

/** Sekunden pro MPEG1-Layer-III-Frame bei 44,1 kHz (1152 Samples). */
const SEC_PER_FRAME_44K = 1152 / 44100

/**
 * Baut einen validen MPEG-Layer-III-Frame (Header + zero-gefüllter Payload).
 * Header: 0xFF 0xFB (MPEG1, Layer III, kein CRC) bzw. 0xFF 0xF3 (MPEG2),
 * Byte 2 = BitrateIndex/SampleRateIndex, Padding-Bit 0.
 * frameLength = floor(samplesPerFrame/8 * bitrate*1000 / sampleRate).
 */
function buildFrame(bitrateKbps: number, sampleRate = 44100, mpeg1 = true): Buffer {
  const bitrates = mpeg1 ? MPEG1_L3_BITRATES : MPEG2_L3_BITRATES
  const sampleRates = mpeg1 ? MPEG1_SAMPLE_RATES : MPEG2_SAMPLE_RATES
  const bitrateIndex = bitrates.indexOf(bitrateKbps)
  const sampleRateIndex = sampleRates.indexOf(sampleRate)
  if (bitrateIndex <= 0 || bitrateIndex >= 15 || sampleRateIndex < 0) {
    throw new Error(`buildFrame: ungültige Kombination ${bitrateKbps}kbps/${sampleRate}Hz`)
  }
  const samplesPerFrame = mpeg1 ? 1152 : 576
  const frameLength = Math.floor(((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate)
  const frame = Buffer.alloc(frameLength) // Payload = 0x00 (keine False-Syncs, kein 'Xing')
  frame[0] = 0xff
  frame[1] = mpeg1 ? 0xfb : 0xf3
  frame[2] = (bitrateIndex << 4) | (sampleRateIndex << 2) // Padding-Bit 0, Private-Bit 0
  frame[3] = 0x00
  return frame
}

/**
 * Frame mit eingebettetem Xing-Header: 'Xing'-Marker an Offset 36 im Frame
 * (4 Byte Header + 32 Byte Side-Info bei MPEG1-Stereo), flags=0x00000001
 * ("frames"-Feld vorhanden) + frameCount als UInt32BE.
 */
function buildXingFrame(frameCount: number, bitrateKbps = 128): Buffer {
  const frame = buildFrame(bitrateKbps)
  frame.write('Xing', 36, 'ascii')
  frame.writeUInt32BE(0x00000001, 40)
  frame.writeUInt32BE(frameCount, 44)
  return frame
}

/**
 * ID3v2.3-Tag: 'ID3' + Version 03 00 + Flags 00 + synchsafe Body-Größe.
 * In den Body werden 0xFF-0xE0-False-Sync-Muster eingestreut — die dürfen
 * die Frame-Suche NICHT verwirren (der Tag wird via Größe übersprungen).
 */
function buildId3v2(bodySize: number): Buffer {
  const tag = Buffer.alloc(10 + bodySize)
  tag.write('ID3', 0, 'ascii')
  tag[3] = 0x03
  tag[4] = 0x00
  tag[5] = 0x00
  tag[6] = (bodySize >> 21) & 0x7f
  tag[7] = (bodySize >> 14) & 0x7f
  tag[8] = (bodySize >> 7) & 0x7f
  tag[9] = bodySize & 0x7f
  for (let i = 10; i + 1 < tag.length; i += 64) {
    tag[i] = 0xff
    tag[i + 1] = 0xe0
  }
  return tag
}

/** Gemischte VBR-Datei OHNE Xing: 100 Frames à 320 kbps + 200 Frames à 128 kbps. */
function buildMixedVbrBody(): { body: Buffer; frames: number; expectedSeconds: number } {
  const frames: Buffer[] = []
  for (let i = 0; i < 100; i++) frames.push(buildFrame(320))
  for (let i = 0; i < 200; i++) frames.push(buildFrame(128))
  return { body: Buffer.concat(frames), frames: 300, expectedSeconds: 300 * SEC_PER_FRAME_44K }
}

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kbk-mp3dur-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeTemp(name: string, buf: Buffer): string {
  const p = path.join(tmpDir, name)
  fs.writeFileSync(p, buf)
  return p
}

describe('mp3-duration — Linie 1: Xing/Info-Header', () => {
  it('liest die Duration aus dem Xing-Frame-Count (nicht aus den physischen Frames)', () => {
    // 1 Xing-Frame (frameCount=1000) + nur 3 physische Folge-Frames → der Header zählt.
    const file = Buffer.concat([buildXingFrame(1000), buildFrame(128), buildFrame(128), buildFrame(128)])
    const p = writeTemp('xing.mp3', file)
    const expected = Math.round(1000 * SEC_PER_FRAME_44K * 10) / 10 // 1000*1152/44100 ≈ 26.1s
    expect(getMp3DurationFromPath(p)).toBe(expected)
    expect(expected).toBe(26.1)
  })
})

describe('mp3-duration — Linie 2: voller Frame-Walk (VBR ohne Xing, Suno-Variante Juli 2026)', () => {
  it('summiert alle Frames statt CBR aus der First-Frame-Bitrate zu schätzen', () => {
    const { body, expectedSeconds } = buildMixedVbrBody()
    const p = writeTemp('vbr-no-xing.mp3', body)
    const dur = getMp3DurationFromPath(p)
    // Frame-Walk: 300*1152/44100 ≈ 7.8s (±0.2s Toleranz).
    expect(Math.abs(dur - expectedSeconds)).toBeLessThanOrEqual(0.2)
    // Die ALTE CBR-Schätzung hätte fileSize/320kbps gerechnet (erster Frame = 320 kbps)
    // und läge damit massiv zu kurz — genau der Vorfall vom 16.07.2026.
    const cbrEstimate = (body.length * 8) / (320 * 1000) // ≈ 4.7s
    expect(Math.abs(dur - cbrEstimate)).toBeGreaterThan(2)
  })

  it('überspringt einen ID3v2-Tag mit False-Sync-Garbage im Body', () => {
    const { body, expectedSeconds } = buildMixedVbrBody()
    // 2048 Bytes Tag-Body voller 0xFF-0xE0-Muster vor den Frames.
    const p = writeTemp('id3-vbr.mp3', Buffer.concat([buildId3v2(2048), body]))
    const dur = getMp3DurationFromPath(p)
    expect(Math.abs(dur - expectedSeconds)).toBeLessThanOrEqual(0.2)
  })

  it('ignoriert False-Syncs zwischen ID3-Ende und erstem echten Frame', () => {
    // 50 Bytes Binärmüll mit INVALIDEN Sync-Kandidaten: 0xFF 0xFB 0xF0 = Bitrate-Index 15 (bad).
    const garbage = Buffer.alloc(50)
    for (let i = 0; i + 3 < garbage.length; i += 4) {
      garbage[i] = 0xff
      garbage[i + 1] = 0xfb
      garbage[i + 2] = 0xf0
      garbage[i + 3] = 0x00
    }
    const { body, expectedSeconds } = buildMixedVbrBody()
    const p = writeTemp('false-sync.mp3', Buffer.concat([buildId3v2(2048), garbage, body]))
    const dur = getMp3DurationFromPath(p)
    expect(Math.abs(dur - expectedSeconds)).toBeLessThanOrEqual(0.2)
  })
})

describe('mp3-duration — Linie 3: Fehlerfälle', () => {
  it('kaputte Datei (kein valider Frame): getMp3DurationFromPath wirft, tryGet gibt null', () => {
    // Deterministisches Pseudo-Rauschen OHNE 0xFF-Bytes → garantiert kein Frame-Sync.
    const junk = Buffer.alloc(4096)
    for (let i = 0; i < junk.length; i++) {
      const b = (i * 97 + 13) & 0xff
      junk[i] = b === 0xff ? 0x7f : b
    }
    const p = writeTemp('junk.bin', junk)
    expect(() => getMp3DurationFromPath(p)).toThrow()
    expect(tryGetMp3Duration(p)).toBeNull()
  })

  it('leere Datei → tryGet null', () => {
    const p = writeTemp('empty.mp3', Buffer.alloc(0))
    expect(() => getMp3DurationFromPath(p)).toThrow()
    expect(tryGetMp3Duration(p)).toBeNull()
  })

  it('Winz-Datei (nur 2 Sync-Bytes) → tryGet null', () => {
    const p = writeTemp('tiny.mp3', Buffer.from([0xff, 0xfb]))
    expect(tryGetMp3Duration(p)).toBeNull()
  })
})
