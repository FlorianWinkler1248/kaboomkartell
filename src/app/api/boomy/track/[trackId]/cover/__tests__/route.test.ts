/**
 * Tests für PUT /api/boomy/track/[trackId]/cover
 *
 * Spec-File analog zu ai-tracks/__tests__/route.test.ts. Lauf: `pnpm test`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PUT } from '../route';

vi.mock('@/lib/db', () => ({
  default: {
    track: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(() => null),
  boomyLimit: {},
}));

const VALID_SECRET = 'dev-fallback-BOOMY_AUTO_PUBLISH_SECRET-DO-NOT-USE-IN-PROD';

function makeRequest(authHeader: string | null, body: unknown): Request {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (authHeader) headers.set('Authorization', authHeader);
  return new Request('http://localhost/api/boomy/track/abc123/cover', {
    method: 'PUT',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const PARAMS = { params: Promise.resolve({ trackId: 'abc123' }) };

describe('PUT /api/boomy/track/[trackId]/cover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Golden Path: ersetzt Cover und gibt 200 zurück', async () => {
    const prisma = (await import('@/lib/db')).default;
    prisma.track.findUnique = vi.fn().mockResolvedValue({ id: 'abc123' });
    prisma.track.update = vi.fn().mockResolvedValue({
      id: 'abc123',
      coverUrl: '/api/uploads/covers/new.png',
    });

    const res = await PUT(
      makeRequest(VALID_SECRET, { coverUrl: '/api/uploads/covers/new.png' }) as never,
      PARAMS as never
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      trackId: 'abc123',
      coverUrl: '/api/uploads/covers/new.png',
    });
    expect(prisma.track.update).toHaveBeenCalledWith({
      where: { id: 'abc123' },
      data: { coverUrl: '/api/uploads/covers/new.png' },
      select: { id: true, coverUrl: true },
    });
  });

  it('Auth-Fail: ohne Header → 403', async () => {
    const res = await PUT(
      makeRequest(null, { coverUrl: '/x.png' }) as never,
      PARAMS as never
    );
    expect(res.status).toBe(403);
  });

  it('404: Track existiert nicht', async () => {
    const prisma = (await import('@/lib/db')).default;
    prisma.track.findUnique = vi.fn().mockResolvedValue(null);

    const res = await PUT(
      makeRequest(VALID_SECRET, { coverUrl: '/x.png' }) as never,
      PARAMS as never
    );
    expect(res.status).toBe(404);
  });

  it('400: leerer coverUrl-String', async () => {
    const res = await PUT(
      makeRequest(VALID_SECRET, { coverUrl: '' }) as never,
      PARAMS as never
    );
    expect(res.status).toBe(400);
  });

  it('400: invalider JSON-Body', async () => {
    const res = await PUT(
      makeRequest(VALID_SECRET, 'not-json{') as never,
      PARAMS as never
    );
    expect(res.status).toBe(400);
  });

  it('400: coverUrl fehlt im Body', async () => {
    const res = await PUT(
      makeRequest(VALID_SECRET, {}) as never,
      PARAMS as never
    );
    expect(res.status).toBe(400);
  });
});
