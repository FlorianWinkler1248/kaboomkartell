import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  default: {
    apiToken: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import {
  generateToken,
  hashToken,
  requireScope,
  authenticateBearer,
  resolveActor,
  type Actor,
} from '../agent-auth';
import { PermissionError } from '../permissions';

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://x/api', { headers });
}

describe('agent-auth: generateToken / hashToken', () => {
  it('erzeugt ein kbk_pat_-Token, dessen Hash zum zurückgegebenen tokenHash passt', () => {
    const { token, tokenHash, tokenPrefix } = generateToken();
    expect(token.startsWith('kbk_pat_')).toBe(true);
    expect(hashToken(token)).toBe(tokenHash);
    expect(tokenPrefix.startsWith('kbk_pat_')).toBe(true);
    // zwei Tokens sind verschieden
    expect(generateToken().token).not.toBe(token);
  });
});

describe('agent-auth: requireScope (Sicherheitsgrenze)', () => {
  it('Session-Actor (*) passiert jeden Scope', () => {
    const a: Actor = { userId: 'u', scopes: ['*'], via: 'session' };
    expect(() => requireScope(a, 'vote')).not.toThrow();
  });
  it('Bearer-Actor mit passendem Scope passiert', () => {
    expect(() => requireScope({ userId: 'u', scopes: ['vote'], via: 'bearer' }, 'vote')).not.toThrow();
  });
  it('Bearer-Actor ohne den Scope wirft', () => {
    expect(() => requireScope({ userId: 'u', scopes: ['shout'], via: 'bearer' }, 'vote')).toThrow(
      PermissionError,
    );
  });
  it('null wirft', () => {
    expect(() => requireScope(null, 'vote')).toThrow(PermissionError);
  });
});

describe('agent-auth: authenticateBearer', () => {
  const OLD = process.env.AGENT_BRIDGE_ENABLED;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENT_BRIDGE_ENABLED = 'true';
  });
  afterEach(() => {
    process.env.AGENT_BRIDGE_ENABLED = OLD;
  });

  it('Kill-Switch aus → null (auch mit gültigem Header)', async () => {
    process.env.AGENT_BRIDGE_ENABLED = 'false';
    expect(await authenticateBearer(req({ authorization: 'Bearer kbk_pat_abc' }))).toBeNull();
  });

  it('kein / falscher Header → null', async () => {
    expect(await authenticateBearer(req())).toBeNull();
    expect(await authenticateBearer(req({ authorization: 'Bearer nope' }))).toBeNull();
  });

  it('gültiger Token + passende tokenVersion → Actor', async () => {
    const prisma = (await import('@/lib/db')).default as unknown as {
      apiToken: { findUnique: ReturnType<typeof vi.fn> };
      user: { findUnique: ReturnType<typeof vi.fn> };
    };
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 't1', userId: 'u1', scopes: 'vote', revokedAt: null, expiresAt: null, userTokenVersion: 3,
    });
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 3 });
    const r = await authenticateBearer(req({ authorization: 'Bearer kbk_pat_valid' }));
    expect(r).toEqual({ userId: 'u1', scopes: ['vote'], via: 'bearer' });
  });

  it('tokenVersion-Mismatch (Logout überall) → null', async () => {
    const prisma = (await import('@/lib/db')).default as unknown as {
      apiToken: { findUnique: ReturnType<typeof vi.fn> };
      user: { findUnique: ReturnType<typeof vi.fn> };
    };
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 't1', userId: 'u1', scopes: 'vote', revokedAt: null, expiresAt: null, userTokenVersion: 2,
    });
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 3 });
    expect(await authenticateBearer(req({ authorization: 'Bearer kbk_pat_valid' }))).toBeNull();
  });

  it('revoked → null; abgelaufen → null', async () => {
    const prisma = (await import('@/lib/db')).default as unknown as {
      apiToken: { findUnique: ReturnType<typeof vi.fn> };
    };
    prisma.apiToken.findUnique.mockResolvedValueOnce({
      id: 't1', userId: 'u1', scopes: 'vote', revokedAt: new Date(), expiresAt: null, userTokenVersion: 3,
    });
    expect(await authenticateBearer(req({ authorization: 'Bearer kbk_pat_x' }))).toBeNull();
    prisma.apiToken.findUnique.mockResolvedValueOnce({
      id: 't1', userId: 'u1', scopes: 'vote', revokedAt: null, expiresAt: new Date(Date.now() - 1000), userTokenVersion: 3,
    });
    expect(await authenticateBearer(req({ authorization: 'Bearer kbk_pat_y' }))).toBeNull();
  });
});

describe('agent-auth: resolveActor', () => {
  beforeEach(() => vi.clearAllMocks());
  it('Session vorhanden → session-Actor mit *-Scope', async () => {
    const { auth } = (await import('@/lib/auth')) as unknown as { auth: ReturnType<typeof vi.fn> };
    auth.mockResolvedValue({ user: { id: 'human1' } });
    expect(await resolveActor(req())).toEqual({ userId: 'human1', scopes: ['*'], via: 'session' });
  });
});
