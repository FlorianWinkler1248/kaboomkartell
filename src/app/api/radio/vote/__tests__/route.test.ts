import { describe, it, expect, vi, beforeEach } from 'vitest';

// prisma + auth wegmocken, damit das native better-sqlite3 nie geladen wird (die
// Original-Module agent-auth/permissions importieren sie beim importOriginal).
vi.mock('@/lib/db', () => ({ default: {} }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// resolveActor mocken, requireScope (echt) behalten — testet die Route-Verdrahtung.
vi.mock('@/lib/agent-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent-auth')>()),
  resolveActor: vi.fn(),
}));
// PermissionError (echt, fuer instanceof) behalten, requireTier auf No-Op.
vi.mock('@/lib/permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/permissions')>()),
  requireTier: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
  radioVoteLimit: { check: vi.fn().mockReturnValue({ success: true }) },
}));
vi.mock('@/lib/radio-state', () => ({
  isCrowdControlEnabled: vi.fn().mockReturnValue(true),
  castVote: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { resolveActor } from '@/lib/agent-auth';
import { requireTier } from '@/lib/permissions';
import { castVote } from '@/lib/radio-state';

function post(body: unknown): NextRequest {
  return new NextRequest('http://x/api/radio/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const validBody = { channel: 'phonk', decisionSeq: 5, candidateTrackId: 'trk_1' };

describe('POST /api/radio/vote — Actor/Bearer-Pfad (P2.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTier).mockResolvedValue(undefined);
  });

  it('kein Actor (weder Session noch gültiger Token) → 401', async () => {
    vi.mocked(resolveActor).mockResolvedValue(null);
    const res = await POST(post(validBody));
    expect(res.status).toBe(401);
  });

  it('Actor mit vote-Scope + T1 → 200, castVote mit der userId des Actors', async () => {
    vi.mocked(resolveActor).mockResolvedValue({ userId: 'u1', scopes: ['vote'], via: 'bearer' });
    vi.mocked(castVote).mockResolvedValue({ status: 200 });
    const res = await POST(post(validBody));
    expect(res.status).toBe(200);
    expect(castVote).toHaveBeenCalledWith('phonk', 5, 'trk_1', 'u1');
  });

  it('Bearer-Actor ohne vote-Scope → 403 (requireScope greift)', async () => {
    vi.mocked(resolveActor).mockResolvedValue({ userId: 'u1', scopes: ['shout'], via: 'bearer' });
    const res = await POST(post(validBody));
    expect(res.status).toBe(403);
  });
});
