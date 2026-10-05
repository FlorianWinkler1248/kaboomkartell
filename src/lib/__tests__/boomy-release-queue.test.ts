/**
 * Tests: Boomys Release-Queue nimmt seit 04.10.2026 auch Hybride.
 *
 * - pickReleaseCandidate fragt beide KI-Klassen ab (ai_generated, ai_assisted)
 * - resolveReleaseCover: Hybrid mit eigenem Cover behält es
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const findUser = vi.fn();
vi.mock('@/lib/db', () => ({
  default: {
    track: { findMany: (...a: unknown[]) => findMany(...a) },
    user: { findUnique: (...a: unknown[]) => findUser(...a) },
  },
}));

import {
  pickReleaseCandidate,
  resolveReleaseCover,
  hybridFeaturingDefaults,
  releaseAnnouncementAuthorId,
  RELEASE_QUEUE_DISCLOSURES,
} from '@/lib/boomy';
import { canAccessTrackAudio } from '@/lib/track-access';
import { AI_DISCLOSURE } from '@/lib/constants';

describe('Release-Queue: Hybride', () => {
  beforeEach(() => {
    findMany.mockReset();
    findUser.mockReset();
  });

  it('die Queue umfasst reine KI-Tracks und Hybride, aber keine Human-Tracks', () => {
    expect(RELEASE_QUEUE_DISCLOSURES).toContain(AI_DISCLOSURE.AI_GENERATED);
    expect(RELEASE_QUEUE_DISCLOSURES).toContain(AI_DISCLOSURE.AI_ASSISTED);
    expect(RELEASE_QUEUE_DISCLOSURES).not.toContain(AI_DISCLOSURE.HUMAN);
  });

  it('pickReleaseCandidate fragt wartende Tracks beider KI-Klassen ab', async () => {
    findMany.mockResolvedValue([{ id: 't1', title: 'Too Slow', genre: 'Hardtek' }]);
    const candidate = await pickReleaseCandidate();
    expect(candidate).toEqual({ trackId: 't1', title: 'Too Slow', genre: 'Hardtek', needsCover: true });
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ sortOrder: 'asc' }, { createdAt: 'asc' }]);
    expect(findMany.mock.calls[0][0].where).toEqual({
      aiDisclosure: { in: RELEASE_QUEUE_DISCLOSURES },
      isPublic: false,
      status: { not: 'ARCHIVED' },
    });
  });

  it('pickReleaseCandidate liefert null bei leerer Queue und bei fremder ID', async () => {
    findMany.mockResolvedValue([]);
    expect(await pickReleaseCandidate()).toBeNull();
    findMany.mockResolvedValue([{ id: 't1', title: 'Too Slow', genre: null }]);
    expect(await pickReleaseCandidate({ trackId: 'anders' })).toBeNull();
  });

  it('resolveReleaseCover: Hybrid mit Cover behält sein Cover', () => {
    expect(
      resolveReleaseCover({ aiDisclosure: AI_DISCLOSURE.AI_ASSISTED, coverUrl: '/api/uploads/covers/a.png' }, 'https://x/neu.png')
    ).toBeUndefined();
  });

  it('resolveReleaseCover: Hybrid ohne Cover und reiner KI-Track nehmen das mitgegebene', () => {
    expect(resolveReleaseCover({ aiDisclosure: AI_DISCLOSURE.AI_ASSISTED, coverUrl: null }, 'https://x/neu.png')).toBe('https://x/neu.png');
    expect(
      resolveReleaseCover({ aiDisclosure: AI_DISCLOSURE.AI_GENERATED, coverUrl: '/api/uploads/covers/alt.jpg' }, 'https://x/neu.png')
    ).toBe('https://x/neu.png');
  });
});

import { boomyDiscordIdentity, siteBaseUrl } from '@/lib/discord-webhook';

describe('Discord: Boomys Absender', () => {
  it('trägt Namen und einen absoluten Avatar auf der eigenen Website', () => {
    const id = boomyDiscordIdentity();
    expect(id.username).toBe('Boomy');
    expect(id.avatar_url).toBe(`${siteBaseUrl()}/images/boomy-avatar.png`);
    expect(id.avatar_url.startsWith('http')).toBe(true);
    expect(siteBaseUrl().endsWith('/')).toBe(false);
  });
});

describe('Release-Queue: Reihenfolge und Cover-Bedarf', () => {
  beforeEach(() => {
    findMany.mockReset();
    findUser.mockReset();
  });

  it('nimmt den ersten der sortierten Liste, nicht einen zufälligen', async () => {
    findMany.mockResolvedValue([
      { id: 'a', title: 'Erster', genre: 'Hardtek', aiDisclosure: 'ai_assisted', coverUrl: '/c/a.png' },
      { id: 'b', title: 'Zweiter', genre: 'Phonk', aiDisclosure: 'ai_generated', coverUrl: null },
    ]);
    for (let i = 0; i < 5; i++) {
      expect((await pickReleaseCandidate())?.trackId).toBe('a');
    }
  });

  it('needsCover: Hybrid mit Cover braucht keins, alle anderen schon', async () => {
    findMany.mockResolvedValue([
      { id: 'a', title: 'A', genre: 'Hardtek', aiDisclosure: 'ai_assisted', coverUrl: '/c/a.png' },
      { id: 'b', title: 'B', genre: 'Hardtek', aiDisclosure: 'ai_assisted', coverUrl: null },
      { id: 'c', title: 'C', genre: 'Phonk', aiDisclosure: 'ai_generated', coverUrl: '/c/c.png' },
    ]);
    expect((await pickReleaseCandidate({ trackId: 'a' }))?.needsCover).toBe(false);
    expect((await pickReleaseCandidate({ trackId: 'b' }))?.needsCover).toBe(true);
    expect((await pickReleaseCandidate({ trackId: 'c' }))?.needsCover).toBe(true);
  });
});

describe('Hybrid-Regel: ai_assisted trägt Boomy als Feature', () => {
  beforeEach(() => findUser.mockReset());

  it('setzt Boomy und aiSource, wenn beides fehlt', async () => {
    findUser.mockResolvedValue({ id: 'boomy-id' });
    expect(
      await hybridFeaturingDefaults(AI_DISCLOSURE.AI_ASSISTED, { featuringArtistId: null, aiSource: null })
    ).toEqual({ featuringArtistId: 'boomy-id', aiSource: 'boomy' });
  });

  it('lässt ein gesetztes Featuring und eine gesetzte Quelle stehen', async () => {
    expect(
      await hybridFeaturingDefaults(AI_DISCLOSURE.AI_ASSISTED, { featuringArtistId: 'wer-anders', aiSource: 'suno' })
    ).toEqual({});
    expect(findUser).not.toHaveBeenCalled();
  });

  it('tut nichts für reine KI-Tracks, Human-Tracks und ohne Angabe', async () => {
    expect(await hybridFeaturingDefaults(AI_DISCLOSURE.AI_GENERATED)).toEqual({});
    expect(await hybridFeaturingDefaults(AI_DISCLOSURE.HUMAN)).toEqual({});
    expect(await hybridFeaturingDefaults(undefined)).toEqual({});
  });

  it('Ankündigung: bei Hybriden postet Boomy, sonst der Künstler', async () => {
    findUser.mockResolvedValue({ id: 'boomy-id' });
    expect(await releaseAnnouncementAuthorId({ aiDisclosure: AI_DISCLOSURE.AI_ASSISTED, artistId: 'flow' })).toBe('boomy-id');
    expect(await releaseAnnouncementAuthorId({ aiDisclosure: AI_DISCLOSURE.AI_GENERATED, artistId: 'boomy-x' })).toBe('boomy-x');
    findUser.mockResolvedValue(null);
    expect(await releaseAnnouncementAuthorId({ aiDisclosure: AI_DISCLOSURE.AI_ASSISTED, artistId: 'flow' })).toBe('flow');
  });
});

describe('Zugriff auf Track-Audio', () => {
  const hidden = { isPublic: false, status: 'DRAFT', artistId: 'artist', uploaderId: 'uploader' };

  it('öffentliche Tracks hört jeder, auch ohne Anmeldung', () => {
    expect(canAccessTrackAudio({ ...hidden, isPublic: true }, null)).toBe(true);
  });

  it('nicht öffentliche Tracks: nur Admin, Künstler und Uploader', () => {
    expect(canAccessTrackAudio(hidden, null)).toBe(false);
    expect(canAccessTrackAudio(hidden, { id: 'fremd', role: 'MITGLIED' })).toBe(false);
    expect(canAccessTrackAudio(hidden, { id: 'fremd', role: 'ADMIN' })).toBe(true);
    expect(canAccessTrackAudio(hidden, { id: 'artist', role: 'KUENSTLER' })).toBe(true);
    expect(canAccessTrackAudio(hidden, { id: 'uploader', role: 'KUENSTLER' })).toBe(true);
  });

  it('archivierte Tracks hört niemand, auch kein Admin', () => {
    expect(canAccessTrackAudio({ ...hidden, isPublic: true, status: 'ARCHIVED' }, { id: 'x', role: 'ADMIN' })).toBe(false);
  });
});
