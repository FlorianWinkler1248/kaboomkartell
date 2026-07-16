/**
 * Tests für das Radio-Sync-v2-Regelgesetz (rein, keine DB/Browser-Abhängigkeit).
 * Lauf: pnpm exec vitest run src/lib/__tests__/radio-sync-control.test.ts
 */

import { describe, it, expect } from 'vitest'
import { computeSyncAction, statusForAction, SYNC, type SyncInput } from '../radio-sync-control'

/** Basis: Track läuft seit 100s, dauert 200s, Audio exakt auf Position. */
function base(overrides: Partial<SyncInput> = {}): SyncInput {
  const startedAtMs = 1_000_000
  const endsAtMs = startedAtMs + 200_000 // 200s Track
  return {
    serverNowMs: startedAtMs + 100_000, // 100s rein
    startedAtMs,
    endsAtMs,
    serverTrackId: 'track-A',
    audioTrackId: 'track-A',
    audioTimeSec: 100, // exakt synchron
    audioDurationSec: 200,
    nextTrackId: null,
    ...overrides,
  }
}

describe('computeSyncAction', () => {
  it('idle, wenn kein Server-Track läuft (Off-Air / Live-Stream)', () => {
    expect(computeSyncAction(base({ serverTrackId: null })).kind).toBe('idle')
  })

  it('hold im Deadband (Phasenfehler < 0.75s)', () => {
    const a = computeSyncAction(base({ audioTimeSec: 100.5 }))
    expect(a.kind).toBe('hold')
    if (a.kind === 'hold') expect(a.playbackRate).toBe(1)
  })

  it('slew schneller (rate > 1), wenn Audio HINTER dem Taktstock liegt', () => {
    const a = computeSyncAction(base({ audioTimeSec: 98 })) // 2s hinterher
    expect(a.kind).toBe('slew')
    if (a.kind === 'slew') {
      expect(a.playbackRate).toBeGreaterThan(1)
      expect(a.playbackRate).toBeLessThanOrEqual(1 + SYNC.MAX_RATE_DELTA)
    }
  })

  it('slew langsamer (rate < 1), wenn Audio VOR dem Taktstock liegt', () => {
    const a = computeSyncAction(base({ audioTimeSec: 102 })) // 2s voraus
    expect(a.kind).toBe('slew')
    if (a.kind === 'slew') {
      expect(a.playbackRate).toBeLessThan(1)
      expect(a.playbackRate).toBeGreaterThanOrEqual(1 - SYNC.MAX_RATE_DELTA)
    }
  })

  it('Tempo-Nudge ist auf ±MAX_RATE_DELTA geklemmt', () => {
    const a = computeSyncAction(base({ audioTimeSec: 100 - 5 })) // 5s hinterher (unter SEEK_MAX)
    expect(a.kind).toBe('slew')
    if (a.kind === 'slew') expect(a.playbackRate).toBeCloseTo(1 + SYNC.MAX_RATE_DELTA, 5)
  })

  it('harter Re-Seek bei großem Versatz (>= SEEK_MAX), auf Track-Dauer geklemmt', () => {
    const a = computeSyncAction(base({ audioTimeSec: 10 })) // 90s hinterher
    expect(a.kind).toBe('seek')
    if (a.kind === 'seek') {
      expect(a.seekToSec).toBeCloseTo(100, 3) // Ziel = serverNow - startedAt
      expect(a.playbackRate).toBe(1)
    }
  })

  it('switch auf den Server-Track, wenn das Audio einen anderen Track spielt', () => {
    const a = computeSyncAction(base({ audioTrackId: 'track-OLD' }))
    expect(a.kind).toBe('switch')
    if (a.kind === 'switch') {
      expect(a.trackId).toBe('track-A')
      expect(a.seekToSec).toBeCloseTo(100, 3)
    }
  })

  it('HOLD statt Zurückreißen, wenn der Client dem faulen Server voraus ist', () => {
    // Audio spielt schon den gelockten nächsten Track (track-B), Server meldet aber
    // noch track-A (mitten in dessen Fenster) → NICHT auf A zurückwechseln.
    const a = computeSyncAction(base({
      serverTrackId: 'track-A',
      audioTrackId: 'track-B',
      nextTrackId: 'track-B',
    }))
    expect(a.kind).toBe('hold')
  })

  it('switch auf den nächsten Track am Track-Ende, wenn gelockt', () => {
    const b = base()
    const a = computeSyncAction({
      ...b,
      serverNowMs: b.endsAtMs + 1_000, // 1s über Ende
      nextTrackId: 'track-B',
    })
    expect(a.kind).toBe('switch')
    if (a.kind === 'switch') {
      expect(a.trackId).toBe('track-B')
      expect(a.seekToSec).toBeCloseTo(1, 3) // serverNow - endsAt
    }
  })

  it('idle am Track-Ende, wenn der nächste Track noch nicht gelockt ist', () => {
    const b = base()
    const a = computeSyncAction({ ...b, serverNowMs: b.endsAtMs + 1_000, nextTrackId: null })
    expect(a.kind).toBe('idle')
  })

  it('idle am Track-Ende, wenn bereits lokal auf den nächsten Track gewechselt wurde', () => {
    const b = base()
    const a = computeSyncAction({
      ...b,
      serverNowMs: b.endsAtMs + 1_000,
      nextTrackId: 'track-B',
      audioTrackId: 'track-B', // schon dort
    })
    expect(a.kind).toBe('idle')
  })

  it('switch beim Initial-Einstieg (Audio noch nichts geladen)', () => {
    const a = computeSyncAction(base({ audioTrackId: null }))
    expect(a.kind).toBe('switch')
    if (a.kind === 'switch') expect(a.trackId).toBe('track-A')
  })
})

// --- Radio Sync v3 (ADR-040): Stall-Guard + Deadband-Hysterese + quellenabhängige
// --- Seek-Schwelle. Alle Inputs OPTIONAL — die 13 v2-Tests oben bleiben unangetastet
// --- und beweisen den exakten v2-Fallback (Kill-Switch-Semantik).
describe('computeSyncAction — v3 (ADR-040)', () => {
  it('hold bei 0.8s-Fehler, wenn nicht slewing (Hysterese-Eintritt erst ab 1.0s)', () => {
    const a = computeSyncAction(base({ audioTimeSec: 100.8, isSlewing: false }))
    expect(a.kind).toBe('hold')
  })

  it('slew bei 0.8s-Fehler, wenn bereits slewing (Hysterese-Verbleib bis 0.35s)', () => {
    const a = computeSyncAction(base({ audioTimeSec: 100.8, isSlewing: true }))
    expect(a.kind).toBe('slew')
  })

  it('hold bei 0.3s-Fehler trotz slewing (Hysterese-Austritt unter 0.35s)', () => {
    const a = computeSyncAction(base({ audioTimeSec: 100.3, isSlewing: true }))
    expect(a.kind).toBe('hold')
  })

  it('v2-Fallback: 0.8s-Fehler OHNE v3-Felder → slew (belegt Kill-Switch-Semantik)', () => {
    // Exakt v2: Deadband 0.75 → 0.8s liegt darüber → Eingriff. Dieser Test hält die
    // Rückbaubarkeit dauerhaft fest: Feld-Übergabe weglassen = altes Regelgesetz.
    const a = computeSyncAction(base({ audioTimeSec: 100.8 }))
    expect(a.kind).toBe('slew')
  })

  it('Stall-Guard: stalled + 20s-Fehler → hold, KEIN Seek (Kaskaden-Verbot)', () => {
    const a = computeSyncAction(base({ audioTimeSec: 80, stalled: true, stalledTicks: 3 }))
    expect(a.kind).toBe('hold')
  })

  it('Stall-Escape: stalled + stalledTicks >= 10 → normale Korrektur (nie ewig einfrieren)', () => {
    const a = computeSyncAction(base({ audioTimeSec: 80, stalled: true, stalledTicks: 10 }))
    expect(a.kind).toBe('seek')
  })

  it('Stall-Guard blockiert Switches NICHT: stalled + Track-Ende + gelockter nextTrack → switch', () => {
    const b = base()
    const a = computeSyncAction({
      ...b,
      serverNowMs: b.endsAtMs + 1_000,
      nextTrackId: 'track-B',
      stalled: true,
      stalledTicks: 2,
    })
    expect(a.kind).toBe('switch')
    if (a.kind === 'switch') expect(a.trackId).toBe('track-B')
  })

  it('quellenabhängige Seek-Schwelle: 8s-Fehler → seek bei Blob (6s), slew bei Netz (10s)', () => {
    const local = computeSyncAction(base({ audioTimeSec: 92, srcIsLocal: true }))
    expect(local.kind).toBe('seek')
    const network = computeSyncAction(base({ audioTimeSec: 92, srcIsLocal: false }))
    expect(network.kind).toBe('slew')
  })
})

describe('statusForAction', () => {
  it('mappt Aktionen auf UI-Status', () => {
    expect(statusForAction({ kind: 'idle' })).toBe('idle')
    expect(statusForAction({ kind: 'hold', playbackRate: 1 })).toBe('synced')
    expect(statusForAction({ kind: 'slew', playbackRate: 1.02 })).toBe('beatmatching')
    expect(statusForAction({ kind: 'seek', seekToSec: 10, playbackRate: 1 })).toBe('seeking')
    expect(statusForAction({ kind: 'switch', trackId: 'x', seekToSec: 0 })).toBe('seeking')
  })
})
