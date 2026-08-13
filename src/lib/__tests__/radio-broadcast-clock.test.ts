/**
 * Tests für das Sender-Regelgesetz des Dauerstreams (rein, keine DB/Dateien).
 * Lauf: pnpm exec vitest run src/lib/__tests__/radio-broadcast-clock.test.ts
 *
 * Der Kern-Fall steht ganz oben: Er bildet den gemeldeten Fehler vom 13.08.2026
 * nach — Ton hinter der Anzeige, weil der Sender den eben beendeten Titel
 * erneut genannt bekam.
 */

import { describe, it, expect } from 'vitest'
import { sendAheadSeconds, decideNextTrack, type TrackRun } from '../radio-broadcast-clock'

const SERVER_NOW = 1_700_000_000_000

describe('sendAheadSeconds', () => {
  it('meldet beim allerersten Takt keinen Vorlauf', () => {
    expect(sendAheadSeconds({
      nowMs: SERVER_NOW, clockStartMs: SERVER_NOW, deliveredSeconds: 0,
    })).toBe(0)
  })

  it('misst den Vorlauf als Differenz aus Spielzeit und Wanduhr', () => {
    // 60s Wanduhr vergangen, 68s Musik ausgegeben → 8s voraus.
    expect(sendAheadSeconds({
      nowMs: SERVER_NOW + 60_000, clockStartMs: SERVER_NOW, deliveredSeconds: 68,
    })).toBe(8)
  })

  it('meldet nie einen negativen Vorlauf', () => {
    // Der Sender hängt hinterher (verschluckter Takt) — das ist kein Rückwärts-Blick.
    expect(sendAheadSeconds({
      nowMs: SERVER_NOW + 60_000, clockStartMs: SERVER_NOW, deliveredSeconds: 55,
    })).toBe(0)
  })
})

describe('decideNextTrack', () => {
  const laufenderDurchlauf: TrackRun = { trackId: 'track-A', startedAtMs: SERVER_NOW - 200_000 }

  it('wartet, wenn die Antwort der eben beendete Durchlauf ist (Fehlerbild 13.08.2026)', () => {
    // Sender hat A fertig ausgegeben; das Programm sieht A noch bei 195s von 200s.
    const decision = decideNextTrack({
      finishedRun: laufenderDurchlauf,
      programTrackId: 'track-A',
      programPositionSeconds: 195,
      programNowMs: SERVER_NOW - 5_000,
    })
    expect(decision.kind).toBe('wait')
  })

  it('spielt den Folge-Titel an der Programm-Position an', () => {
    const decision = decideNextTrack({
      finishedRun: laufenderDurchlauf,
      programTrackId: 'track-B',
      programPositionSeconds: 1.5,
      programNowMs: SERVER_NOW,
    })
    expect(decision).toEqual({
      kind: 'play',
      run: { trackId: 'track-B', startedAtMs: SERVER_NOW - 1_500 },
      startAtSeconds: 1.5,
    })
  })

  it('steigt beim Sender-Start mitten im laufenden Titel ein', () => {
    const decision = decideNextTrack({
      finishedRun: null,
      programTrackId: 'track-A',
      programPositionSeconds: 47,
      programNowMs: SERVER_NOW,
    })
    expect(decision).toEqual({
      kind: 'play',
      run: { trackId: 'track-A', startedAtMs: SERVER_NOW - 47_000 },
      startAtSeconds: 47,
    })
  })

  it('lässt denselben Titel als NEUEN Durchlauf wieder zu', () => {
    // Der Zufall zieht A erneut: gleiche Kennung, aber ein anderer Durchlauf.
    const decision = decideNextTrack({
      finishedRun: laufenderDurchlauf,
      programTrackId: 'track-A',
      programPositionSeconds: 0,
      programNowMs: SERVER_NOW,
    })
    expect(decision.kind).toBe('play')
    if (decision.kind === 'play') {
      expect(decision.run.startedAtMs).toBe(SERVER_NOW)
      expect(decision.startAtSeconds).toBe(0)
    }
  })

  it('erkennt denselben Durchlauf trotz kleiner Rechen-Schwankung wieder', () => {
    // Startzeit weicht um 2s ab (Rundung/Laufzeit) — immer noch derselbe Durchlauf.
    const decision = decideNextTrack({
      finishedRun: laufenderDurchlauf,
      programTrackId: 'track-A',
      programPositionSeconds: 198,
      programNowMs: SERVER_NOW,
    })
    expect(decision.kind).toBe('wait')
  })

  it('meldet Off-Air, wenn das Programm keinen Titel nennt', () => {
    expect(decideNextTrack({
      finishedRun: laufenderDurchlauf,
      programTrackId: null,
      programPositionSeconds: 0,
      programNowMs: SERVER_NOW,
    }).kind).toBe('offair')
  })

  it('behandelt eine negative Position als Anfang', () => {
    const decision = decideNextTrack({
      finishedRun: null,
      programTrackId: 'track-C',
      programPositionSeconds: -0.2,
      programNowMs: SERVER_NOW,
    })
    expect(decision.kind).toBe('play')
    if (decision.kind === 'play') expect(decision.startAtSeconds).toBe(0)
  })
})
