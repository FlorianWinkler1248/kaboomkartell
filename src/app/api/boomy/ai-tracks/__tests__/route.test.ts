/**
 * Tests für GET /api/boomy/ai-tracks
 *
 * Prisma + Rate-Limit werden per vi.mock ersetzt (kein Native-Build nötig).
 * Lauf: `pnpm test`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';

vi.mock('@/lib/db', () => ({
  default: {
    track: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(() => null),
  boomyLimit: {},
}));

const VALID_SECRET = 'dev-fallback-BOOMY_AUTO_PUBLISH_SECRET-DO-NOT-USE-IN-PROD';

function makeRequest(authHeader: string | null): Request {
  const headers = new Headers();
  if (authHeader) headers.set('Authorization', authHeader);
  return new Request('http://localhost/api/boomy/ai-tracks', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/boomy/ai-tracks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Golden Path: liefert AI-Tracks mit korrektem Tag-Mapping', async () => {
    const prisma = (await import('@/lib/db')).default;
    prisma.track.findMany = vi.fn().mockResolvedValue([
      {
        id: 't1',
        title: 'Boomy Solo',
        genre: 'Phonk',
        coverUrl: '/covers/a.png',
        aiDisclosure: 'ai_generated',
      },
      {
        id: 't2',
        title: 'Hybrid Track',
        genre: 'Phonk',
        coverUrl: '/covers/b.png',
        aiDisclosure: 'ai_assisted',
      },
    ]);

    const res = await GET(makeRequest(VALID_SECRET) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      trackId: 't1',
      title: 'Boomy Solo',
      genre: 'Phonk',
      tag: 'ai-only',
      currentCoverUrl: '/covers/a.png',
    });
    expect(body.data[1].tag).toBe('ai-feature');
  });

  it('Auth-Fail: ohne Header → 403', async () => {
    const res = await GET(makeRequest(null) as never);
    expect(res.status).toBe(403);
  });

  it('Auth-Fail: falsches Secret → 403', async () => {
    const res = await GET(makeRequest('wrong-secret') as never);
    expect(res.status).toBe(403);
  });

  it('Empty: keine AI-Tracks in DB → leeres data-Array', async () => {
    const prisma = (await import('@/lib/db')).default;
    prisma.track.findMany = vi.fn().mockResolvedValue([]);

    const res = await GET(makeRequest(VALID_SECRET) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});
