/**
 * Tests: Boomys Release-Queue nimmt seit 04.10.2026 auch Hybride.
 *
 * - pickReleaseCandidate fragt beide KI-Klassen ab (ai_generated, ai_assisted)
 * - resolveReleaseCover: Hybrid mit eigenem Cover behält es
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
vi.mock('@/lib/db', () => ({ default: { track: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { pickReleaseCandidate, resolveReleaseCover, RELEASE_QUEUE_DISCLOSURES } from '@/lib/boomy';
import { AI_DISCLOSURE } from '@/lib/constants';

describe('Release-Queue: Hybride', () => {
  beforeEach(() => findMany.mockReset());

  it('die Queue umfasst reine KI-Tracks und Hybride, aber keine Human-Tracks', () => {
    expect(RELEASE_QUEUE_DISCLOSURES).toContain(AI_DISCLOSURE.AI_GENERATED);
    expect(RELEASE_QUEUE_DISCLOSURES).toContain(AI_DISCLOSURE.AI_ASSISTED);
    expect(RELEASE_QUEUE_DISCLOSURES).not.toContain(AI_DISCLOSURE.HUMAN);
  });

  it('pickReleaseCandidate fragt wartende Tracks beider KI-Klassen ab', async () => {
    findMany.mockResolvedValue([{ id: 't1', title: 'Too Slow', genre: 'Hardtek' }]);
    const candidate = await pickReleaseCandidate();
    expect(candidate).toEqual({ trackId: 't1', title: 'Too Slow', genre: 'Hardtek' });
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
    expect(id.avatar_url).toBe(`${siteBaseUrl()}/images/boomy-sprite-1.png`);
    expect(id.avatar_url.startsWith('http')).toBe(true);
    expect(siteBaseUrl().endsWith('/')).toBe(false);
  });
});
