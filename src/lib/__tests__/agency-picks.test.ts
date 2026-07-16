// Unit-Spec für die client-seitige „Dein Pick läuft"-Erkennung (agency-picks.ts).
// Agency-Loop, 18.06.2026, ADR-033. Doku: prozesse/kbk-crowd-control.md (Sektion „Agency-Feedback").
//
// agency-picks.ts ist client-safe (kein prisma/fs) und liest localStorage über einen
// SSR-Guard (typeof window). Die vitest-Default-Env ist 'node' (kein jsdom) → wir
// injizieren hier eine Mock-window.localStorage auf globalThis. Run:
//   pnpm exec vitest run src/lib/__tests__/agency-picks.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// In-Memory-Mock von localStorage (Web-Storage-API-Teilmenge).
function makeMockStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    _store: store,
  }
}

let mock: ReturnType<typeof makeMockStorage>
let picks: typeof import('../agency-picks')

beforeEach(async () => {
  mock = makeMockStorage()
  // window in der node-Env bereitstellen, damit der SSR-Guard durchlässt.
  ;(globalThis as { window?: unknown }).window = { localStorage: mock }
  // frisch importieren (Modul hält keinen State, aber sauber).
  picks = await import('../agency-picks')
})

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

const CH = 'phonk'

describe('agency-picks — record → consume mit N+2-Versatz', () => {
  it('PICK_OFFSET ist 2 (ein gevoteter Track läuft als decisionSeq+2)', () => {
    expect(picks.PICK_OFFSET).toBe(2)
  })

  it('vote für Fenster S → Track läuft als S+2 → erkannt als mein Pick', () => {
    picks.recordMyVote(CH, 10, 'trackA')
    // Track läuft als playingDecisionSeq = 12 (= 10 + 2).
    expect(picks.consumePickIfMatches(CH, 12, 'trackA')).toBe(true)
  })

  it('falscher Versatz (S+1 statt S+2) → kein Match', () => {
    picks.recordMyVote(CH, 10, 'trackA')
    expect(picks.consumePickIfMatches(CH, 11, 'trackA')).toBe(false)
  })

  it('richtiges Fenster, falscher Track → kein Match', () => {
    picks.recordMyVote(CH, 10, 'trackA')
    expect(picks.consumePickIfMatches(CH, 12, 'trackB')).toBe(false)
  })

  it('anderer Channel → kein Match (Picks sind channel-lokal)', () => {
    picks.recordMyVote(CH, 10, 'trackA')
    expect(picks.consumePickIfMatches('hardtek', 12, 'trackA')).toBe(false)
  })
})

describe('agency-picks — Doppel-consume-Schutz', () => {
  it('zweiter Aufruf für denselben Treffer → false (kein Doppel-Toast)', () => {
    picks.recordMyVote(CH, 10, 'trackA')
    expect(picks.consumePickIfMatches(CH, 12, 'trackA')).toBe(true)
    // identischer Track-Wechsel/Re-Render darf nicht erneut feuern.
    expect(picks.consumePickIfMatches(CH, 12, 'trackA')).toBe(false)
  })

  it('Umentscheiden im selben Fenster setzt consumed zurück', () => {
    picks.recordMyVote(CH, 10, 'trackA')
    expect(picks.consumePickIfMatches(CH, 12, 'trackA')).toBe(true)
    // User entscheidet sich um (gleiches Fenster, anderer Track) → frischer Pick.
    picks.recordMyVote(CH, 10, 'trackB')
    expect(picks.consumePickIfMatches(CH, 12, 'trackB')).toBe(true)
    // alter Track matcht jetzt nicht mehr (überschrieben).
    expect(picks.consumePickIfMatches(CH, 12, 'trackA')).toBe(false)
  })
})

describe('agency-picks — Pruning (nur letzte ~10 Fenster)', () => {
  it('alte Fenster fallen FIFO raus, jüngste bleiben', () => {
    // 15 Picks → nur die letzten 10 (decisionSeq 5..14) bleiben.
    for (let seq = 0; seq < 15; seq++) {
      picks.recordMyVote(CH, seq, `t${seq}`)
    }
    // ältestes (seq 0 → läuft als 2) ist weg.
    expect(picks.consumePickIfMatches(CH, 2, 't0')).toBe(false)
    // jüngstes (seq 14 → läuft als 16) ist da.
    expect(picks.consumePickIfMatches(CH, 16, 't14')).toBe(true)
  })
})

describe('agency-picks — Source-Gate ist Aufrufer-Sache, aber consume bleibt robust', () => {
  it('null/undefined playingDecisionSeq → false (kein Crash)', () => {
    picks.recordMyVote(CH, 10, 'trackA')
    expect(picks.consumePickIfMatches(CH, null, 'trackA')).toBe(false)
    expect(picks.consumePickIfMatches(CH, undefined, 'trackA')).toBe(false)
    expect(picks.consumePickIfMatches(CH, 12, null)).toBe(false)
  })

  it('recordMyVote ignoriert unvollständige Eingaben', () => {
    picks.recordMyVote('', 10, 'trackA')
    picks.recordMyVote(CH, NaN, 'trackA')
    picks.recordMyVote(CH, 10, '')
    // nichts davon erzeugt einen matchbaren Pick.
    expect(picks.consumePickIfMatches(CH, 12, 'trackA')).toBe(false)
  })
})

// Der Picks-landed-Zähler wurde am 16.07.2026 entfernt (Flow-Entscheid) —
// die zugehörigen Tests sind mit ihm gegangen; der Toast-Pfad bleibt getestet.

describe('agency-picks — robust gegen fehlendes/kaputtes localStorage', () => {
  it('kaputtes JSON in den Picks → leeres Array, kein Crash', () => {
    mock.setItem('kbk_my_picks_phonk', '{nicht valides json')
    expect(picks.consumePickIfMatches(CH, 12, 'trackA')).toBe(false)
    // record darüber funktioniert trotzdem (überschreibt den Müll).
    picks.recordMyVote(CH, 10, 'trackA')
    expect(picks.consumePickIfMatches(CH, 12, 'trackA')).toBe(true)
  })

  it('SSR / kein window → alle Reads/Writes still, kein Throw', () => {
    delete (globalThis as { window?: unknown }).window
    expect(() => picks.recordMyVote(CH, 10, 'trackA')).not.toThrow()
    expect(picks.consumePickIfMatches(CH, 12, 'trackA')).toBe(false)
  })

  it('localStorage wirft (Privacy-Modus) → still abgefangen', () => {
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => { throw new Error('blocked') },
        setItem: () => { throw new Error('blocked') },
      },
    }
    expect(() => picks.recordMyVote(CH, 10, 'trackA')).not.toThrow()
    expect(picks.consumePickIfMatches(CH, 12, 'trackA')).toBe(false)
  })
})
