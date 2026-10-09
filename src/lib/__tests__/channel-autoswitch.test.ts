// Vitest-Spec für den Auto-Switch der Radio-Channels (src/lib/channel-autoswitch.ts).

import { describe, it, expect } from 'vitest'
import {
  pickAutoSwitchTarget,
  computeSwitchAtMs,
  formatCountdown,
  AUTO_SWITCH_FALLBACK_MS,
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
  it('nimmt den Beginn des nächsten Titels im Ziel-Channel', () => {
    expect(computeSwitchAtMs(1_090_000, 1_000_000)).toBe(1_090_000)
  })

  it('fällt auf den festen Countdown zurück, wenn der Wert fehlt oder vorbei ist', () => {
    expect(computeSwitchAtMs(null, 1_000_000)).toBe(1_000_000 + AUTO_SWITCH_FALLBACK_MS)
    expect(computeSwitchAtMs(NaN, 1_000_000)).toBe(1_000_000 + AUTO_SWITCH_FALLBACK_MS)
    expect(computeSwitchAtMs(999_000, 1_000_000)).toBe(1_000_000 + AUTO_SWITCH_FALLBACK_MS)
  })
})

describe('channel-autoswitch — formatCountdown', () => {
  it('rundet auf und zeigt m:ss', () => {
    expect(formatCountdown(83_200)).toBe('1:24')
    expect(formatCountdown(9_000)).toBe('0:09')
    expect(formatCountdown(-500)).toBe('0:00')
  })
})
