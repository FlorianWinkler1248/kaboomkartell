// Vitest-Spec für die Schedule-Engine (radio.ts), Fokus: LIVE-Channel +
// wiederkehrende Events (ADR-028).
// Läuft mit `pnpm test`. radio.ts ist prisma-frei (R2) → direkt testbar.

import { describe, it, expect } from 'vitest'
import {
  getNowPlaying,
  getUpcoming,
  getActiveChannels,
  findCurrentSlot,
  LIVE_CHANNEL,
} from '../radio'

function pool(id: string, genre: string, name: string, nTracks = 4) {
  return {
    id,
    name,
    genre,
    tracks: Array.from({ length: nTracks }, (_, i) => ({
      id: `${id}-t${i}`,
      title: `T${i}`,
      artist: 'A',
      duration: 180,
      streamUrl: `/s/${id}-t${i}`,
    })),
  }
}

function makePools() {
  const m = new Map()
  m.set('phonk', pool('phonk', 'Phonk', 'Phonk'))
  m.set('braz', pool('braz', 'Brazilian Phonk', 'Brazilian Phonk'))
  m.set('hard', pool('hard', 'Hardtek', 'Hardtek'))
  return m
}

// Lokale Zeit-Konstruktoren (Engine nutzt getDay()/getHours() — lokal). now + Event-
// Template in derselben lokalen Konvention → TZ-unabhängig konsistent.
const now = new Date(2026, 5, 12, 18, 30, 0) // ein Freitag, 18:30 lokal
const DOW = now.getDay()

// Wiederkehrendes Twitch-Event Fr 18–20 (nur Uhrzeit aus dem Template zählt).
const recurringTwitch = {
  id: 'ev-live',
  title: 'KBK Friday Live',
  description: null,
  startTime: new Date(2020, 0, 1, 18, 0, 0),
  endTime: new Date(2020, 0, 1, 20, 0, 0),
  eventType: 'TWITCH',
  poolId: null,
  streamUrl: 'https://www.twitch.tv/kbk4flow',
  recurringDayOfWeek: DOW,
}

// Parallel laufende Pool-Slots: Brazilian 18–20 (phonk-Channel), Hardphonk 16–18 (vorbei).
const slots = [
  { id: 's-braz', dayOfWeek: DOW, startHour: 18, startMin: 0, endHour: 20, endMin: 0, label: 'Brazilian Phonk', priority: 0, poolId: 'braz' },
  { id: 's-hard', dayOfWeek: DOW, startHour: 16, startMin: 0, endHour: 18, endMin: 0, label: 'Hardphonk', priority: 0, poolId: 'hard' },
]

describe('LIVE-Channel + recurring Twitch-Event (ADR-028)', () => {
  it('liefert das Stream-Event auf dem LIVE-Channel', () => {
    const r = getNowPlaying(slots, [recurringTwitch], makePools(), now, LIVE_CHANNEL)!
    expect(r).not.toBeNull()
    expect(r.eventType).toBe('TWITCH')
    expect(r.streamUrl).toBe('https://www.twitch.tv/kbk4flow')
    expect(r.track).toBeNull() // Stream, kein Pool-Track
  })

  it('lässt phonk PARALLEL weiterlaufen (Stream überschreibt nicht)', () => {
    const r = getNowPlaying(slots, [recurringTwitch], makePools(), now, 'phonk')!
    expect(r).not.toBeNull()
    expect(r.eventType).toBeUndefined() // Pool-Slot, kein Live-Event
    expect(r.slot.label).toContain('Brazilian')
    expect(r.track?.id).toContain('braz') // Track stammt aus dem Brazilian-Pool
  })

  it('meldet live + phonk als aktive Channels (hardtek ist 16–18 vorbei)', () => {
    const active = getActiveChannels(slots, [recurringTwitch], makePools(), now)
    expect(active).toContain('live')
    expect(active).toContain('phonk')
    expect(active).not.toContain('hardtek')
  })

  it('ist außerhalb des Zeitfensters inaktiv (17:30 / 20:00 exklusiv)', () => {
    const before = new Date(2026, 5, 12, 17, 30, 0)
    const atEnd = new Date(2026, 5, 12, 20, 0, 0)
    expect(findCurrentSlot(slots, [recurringTwitch], makePools(), before, LIVE_CHANNEL)).toBeNull()
    expect(findCurrentSlot(slots, [recurringTwitch], makePools(), atEnd, LIVE_CHANNEL)).toBeNull()
  })

  it('feuert nur am konfigurierten Wochentag', () => {
    const otherDay = new Date(2026, 5, 13, 18, 30, 0) // Folgetag
    expect(findCurrentSlot(slots, [recurringTwitch], makePools(), otherDay, LIVE_CHANNEL)).toBeNull()
  })

  it('taucht in der Programmvorschau als Live-Event auf', () => {
    const upcoming = getUpcoming(slots, [recurringTwitch], makePools(), now, 24)
    const live = upcoming.find((e) => e.isLive && e.eventType === 'TWITCH')!
    expect(live).toBeDefined()
    expect(live.label).toBe('KBK Friday Live')
  })

  it('verdrängt parallele Slots NICHT aus der Vorschau', () => {
    const upcoming = getUpcoming(slots, [recurringTwitch], makePools(), now, 24)
    // Der Brazilian-Slot 18–20 muss trotz parallelem Live-Event sichtbar bleiben.
    const braz = upcoming.find((e) => e.type === 'weekly' && (e.label || '').includes('Brazilian'))
    expect(braz).toBeDefined()
  })
})

describe('Einmalige Events bleiben unverändert (keine Regression)', () => {
  it('absolutes Zeitfenster greift weiter', () => {
    const oneTime = {
      id: 'ev-once',
      title: 'One Off',
      description: null,
      startTime: new Date(now.getTime() - 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
      eventType: 'TWITCH',
      poolId: null,
      streamUrl: 'https://www.twitch.tv/kbk4flow',
      recurringDayOfWeek: null,
    }
    const r = getNowPlaying(slots, [oneTime], makePools(), now, LIVE_CHANNEL)!
    expect(r).not.toBeNull()
    expect(r.eventType).toBe('TWITCH')
  })
})
