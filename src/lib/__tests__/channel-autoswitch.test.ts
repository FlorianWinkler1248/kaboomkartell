// Vitest-Spec für den Auto-Switch der Radio-Channels (src/lib/channel-autoswitch.ts).

import { describe, it, expect } from 'vitest'
import {
  pickAutoSwitchTarget,
  computeSwitchAtMs,
  formatCountdown,
  AUTO_SWITCH_SILENT_MS,
} from '../channel-autoswitch'

describe('channel-autoswitch — pickAutoSwitchTarget', () => {
  it('wechselt zum anderen Channel, wenn der eigene kein Set mehr hat', () => {
    expect(pickAutoSwitchTarget('phonk', ['hardtek'])).toBe('hardtek')
    expect(pickAutoSwitchTarget('hardtek', ['phonk'])).toBe('phonk')
  })

  it('bleibt, solange der eigene Channel sendet (auch wenn beide senden)', () => {
    expect(pickAutoSwitchTarget('phonk', ['phonk'])).toBeNull()
    expect(pickAutoSwitchTarget('phonk', ['phonk', 'hardtek'])).toBeNull()
  })

  it('bleibt, wenn auch der andere Channel nicht sendet', () => {
    expect(pickAutoSwitchTarget('phonk', [])).toBeNull()
    expect(pickAutoSwitchTarget('phonk', ['live'])).toBeNull()
  })

  it('bleibt, wenn der Server das Feld nicht liefert oder der Channel fremd ist', () => {
    expect(pickAutoSwitchTarget('phonk', null)).toBeNull()
    expect(pickAutoSwitchTarget('live', ['phonk'])).toBeNull()
  })
})

describe('channel-autoswitch — computeSwitchAtMs', () => {
  const now = 1_000_000

  it('wechselt spätestens am Ende des eigenen letzten Titels — keine Stille', () => {
    expect(computeSwitchAtMs(now + 40_000, now + 90_000, now)).toBe(now + 40_000)
  })

  it('wechselt früher, wenn im Ziel-Channel vorher ein neuer Titel beginnt', () => {
    expect(computeSwitchAtMs(now + 90_000, now + 40_000, now)).toBe(now + 40_000)
  })

  it('nimmt das eigene Titelende, wenn der Titelbeginn im Ziel unbekannt ist', () => {
    expect(computeSwitchAtMs(now + 40_000, null, now)).toBe(now + 40_000)
    expect(computeSwitchAtMs(now + 40_000, now - 1_000, now)).toBe(now + 40_000)
  })

  it('wartet nicht in Stille: läuft im eigenen Channel nichts, gilt der kurze Countdown', () => {
    expect(computeSwitchAtMs(null, now + 120_000, now)).toBe(now + AUTO_SWITCH_SILENT_MS)
    expect(computeSwitchAtMs(now - 1, now + 120_000, now)).toBe(now + AUTO_SWITCH_SILENT_MS)
    expect(computeSwitchAtMs(NaN, null, now)).toBe(now + AUTO_SWITCH_SILENT_MS)
  })
})

describe('channel-autoswitch — formatCountdown', () => {
  it('rundet auf und zeigt m:ss', () => {
    expect(formatCountdown(83_200)).toBe('1:24')
    expect(formatCountdown(9_000)).toBe('0:09')
    expect(formatCountdown(-500)).toBe('0:00')
  })
})
