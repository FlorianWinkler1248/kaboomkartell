/**
 * Tests für die Player-Queue-Mechanik (rein, keine DB/Browser-Abhängigkeit).
 * Lauf: pnpm exec vitest run src/lib/__tests__/player-queue.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  identityOrder, shuffledOrder, currentTrackIndex, nextCursor, prevCursor,
  upNextIndices, withShuffle, withRemovedTrack, withReorderedTracks,
  withAppendedTracks, type QueueState,
} from '../player-queue'

/** Basis: 5 Titel, ungemischt, Cursor auf dem ersten. */
function base(overrides: Partial<QueueState> = {}): QueueState {
  return { order: identityOrder(5), cursor: 0, shuffle: false, repeat: 'off', ...overrides }
}

describe('Reihenfolge', () => {
  it('identityOrder liefert die natürliche Folge', () => {
    expect(identityOrder(4)).toEqual([0, 1, 2, 3])
    expect(identityOrder(0)).toEqual([])
  })

  it('shuffledOrder ist eine echte Permutation (kein Titel verloren, keiner doppelt)', () => {
    const order = shuffledOrder(20, 12345)
    expect([...order].sort((a, b) => a - b)).toEqual(identityOrder(20))
  })

  it('shuffledOrder ist bei gleichem Seed reproduzierbar und bei anderem Seed verschieden', () => {
    expect(shuffledOrder(20, 42)).toEqual(shuffledOrder(20, 42))
    expect(shuffledOrder(20, 42)).not.toEqual(shuffledOrder(20, 43))
  })

  it('pinFirst hält den laufenden Titel vorne', () => {
    const order = shuffledOrder(10, 7, 4)
    expect(order[0]).toBe(4)
    expect([...order].sort((a, b) => a - b)).toEqual(identityOrder(10))
  })
})

describe('Vor und Zurück', () => {
  it('läuft ohne Repeat bis zum Ende und hört dann auf', () => {
    expect(nextCursor(base({ cursor: 3 }))).toBe(4)
    expect(nextCursor(base({ cursor: 4 }))).toBeNull()
  })

  it('repeat "all" springt am Ende an den Anfang, am Anfang ans Ende', () => {
    expect(nextCursor(base({ cursor: 4, repeat: 'all' }))).toBe(0)
    expect(prevCursor(base({ cursor: 0, repeat: 'all' }))).toBe(4)
  })

  it('repeat "one" bleibt stehen', () => {
    expect(nextCursor(base({ cursor: 2, repeat: 'one' }))).toBe(2)
    expect(prevCursor(base({ cursor: 2, repeat: 'one' }))).toBe(2)
  })

  it('zurück am Anfang der Queue bleibt beim ersten Titel statt ins Leere zu laufen', () => {
    expect(prevCursor(base({ cursor: 0 }))).toBe(0)
  })

  it('leere Queue liefert keine Position', () => {
    const empty = base({ order: [], cursor: -1 })
    expect(nextCursor(empty)).toBeNull()
    expect(prevCursor(empty)).toBeNull()
    expect(currentTrackIndex(empty)).toBeNull()
  })

  it('REGRESSION: „vorheriger Titel" liefert im Shuffle den zuletzt gehörten, '
    + 'keinen Zufallstitel', () => {
    const shuffled = withShuffle(base({ cursor: 0 }), true, 999)
    // Zwei Schritte vorwärts, dann einen zurück — wir müssen exakt dort landen,
    // wo wir vorher waren.
    const afterFirst = nextCursor(shuffled)!
    const s1 = { ...shuffled, cursor: afterFirst }
    const trackAtFirstStep = currentTrackIndex(s1)

    const afterSecond = nextCursor(s1)!
    const s2 = { ...s1, cursor: afterSecond }

    const back = prevCursor(s2)!
    expect(currentTrackIndex({ ...s2, cursor: back })).toBe(trackAtFirstStep)
  })
})

describe('Als Nächstes', () => {
  it('zeigt die kommenden Titel in Abspiel-Reihenfolge', () => {
    expect(upNextIndices(base({ cursor: 1 }), 3)).toEqual([2, 3, 4])
  })

  it('endet ohne Repeat am Queue-Ende', () => {
    expect(upNextIndices(base({ cursor: 3 }), 3)).toEqual([4])
  })

  it('läuft mit repeat "all" über den Anfang weiter', () => {
    expect(upNextIndices(base({ cursor: 3, repeat: 'all' }), 3)).toEqual([4, 0, 1])
  })

  it('zeigt bei repeat "one" nichts an — es kommt ja immer derselbe Titel', () => {
    expect(upNextIndices(base({ cursor: 1, repeat: 'one' }), 3)).toEqual([])
  })

  it('folgt der gemischten Reihenfolge, nicht der Listen-Reihenfolge', () => {
    const shuffled = withShuffle(base({ cursor: 0 }), true, 4711)
    expect(upNextIndices(shuffled, 4)).toEqual(shuffled.order.slice(1, 5))
  })
})

describe('Shuffle umschalten', () => {
  it('einschalten lässt den laufenden Titel laufen', () => {
    const before = base({ cursor: 2 })
    const playing = currentTrackIndex(before)
    const after = withShuffle(before, true, 123)
    expect(currentTrackIndex(after)).toBe(playing)
    expect(after.shuffle).toBe(true)
  })

  it('ausschalten stellt die Listen-Reihenfolge her, ohne den Titel zu wechseln', () => {
    const shuffled = withShuffle(base({ cursor: 2 }), true, 123)
    const playing = currentTrackIndex(shuffled)
    const back = withShuffle(shuffled, false, 0)
    expect(back.order).toEqual(identityOrder(5))
    expect(currentTrackIndex(back)).toBe(playing)
  })
})

describe('Queue bearbeiten', () => {
  it('entfernt einen Titel und lässt die Wiedergabe stehen', () => {
    const before = base({ cursor: 3 }) // spielt Track 3
    const after = withRemovedTrack(before, 1)
    expect(after.order).toEqual([0, 1, 2, 3]) // 5 Titel minus einer, neu durchnummeriert
    expect(currentTrackIndex(after)).toBe(2) // der ehemalige Track 3
  })

  it('entfernt einen Titel HINTER der Wiedergabe, ohne den Cursor zu bewegen', () => {
    const after = withRemovedTrack(base({ cursor: 1 }), 4)
    expect(currentTrackIndex(after)).toBe(1)
  })

  it('rückt auf den nachfolgenden Titel, wenn der laufende entfernt wird', () => {
    const after = withRemovedTrack(base({ cursor: 2 }), 2)
    expect(after.order).toEqual([0, 1, 2, 3])
    expect(currentTrackIndex(after)).toBe(2) // vormals Track 3
  })

  it('behält den laufenden Titel beim Umsortieren der Liste', () => {
    // Liste [0,1,2,3,4] → [2,0,1,3,4]: der laufende Track 2 wandert nach vorn.
    const after = withReorderedTracks(base({ cursor: 2 }), [2, 0, 1, 3, 4])
    expect(currentTrackIndex(after)).toBe(0)
    expect(after.order).toEqual(identityOrder(5))
  })

  it('hängt neue Titel hinten an, ohne die laufende Wiedergabe zu stören', () => {
    const after = withAppendedTracks(base({ cursor: 1 }), 2)
    expect(after.order).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(currentTrackIndex(after)).toBe(1)
  })

  it('Anhängen im Shuffle stellt die neuen Titel ans Ende, nicht sofort dran', () => {
    const shuffled = withShuffle(base({ cursor: 0 }), true, 55)
    const after = withAppendedTracks(shuffled, 1)
    expect(after.order[after.order.length - 1]).toBe(5)
    expect(currentTrackIndex(after)).toBe(currentTrackIndex(shuffled))
  })
})
