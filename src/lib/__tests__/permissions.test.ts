// Unit-Spec für die Permission-Helper (permissions.ts, v2.27, ADR-005 Phase 1).
// userHasBadge ist rein (sync); hasBadge/requireBadge/requireTier nutzen prisma
// → DB per vi.mock ersetzt (kein Native-Build nötig). Lauf: `pnpm test`.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  default: {
    user: { findUnique: vi.fn() },
    badge: { findUnique: vi.fn() },
  },
}))

import prisma from '@/lib/db'
import {
  userHasBadge,
  hasBadge,
  requireBadge,
  requireTier,
  PermissionError,
  BADGES,
} from '../permissions'

const userFind = vi.mocked(prisma.user.findUnique)
const badgeFind = vi.mocked(prisma.badge.findUnique)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('userHasBadge (sync, eager-loaded)', () => {
  it('ADMIN hat implizit jedes Badge', () => {
    expect(userHasBadge({ role: 'ADMIN', badges: [] }, BADGES.MOD_COMMUNITY)).toBe(true)
  })

  it('Nicht-Admin: Badge in der Liste → true', () => {
    expect(
      userHasBadge({ role: 'MITGLIED', badges: [{ type: BADGES.ARTIST_UPLOAD }] }, BADGES.ARTIST_UPLOAD)
    ).toBe(true)
  })

  it('Nicht-Admin: Badge fehlt → false', () => {
    expect(userHasBadge({ role: 'MITGLIED', badges: [] }, BADGES.VERIFIED)).toBe(false)
    expect(userHasBadge({ role: 'HELFER' }, BADGES.VERIFIED)).toBe(false)
  })
})

describe('hasBadge (async, DB)', () => {
  it('ADMIN-Bypass ohne Badge-Lookup', async () => {
    userFind.mockResolvedValue({ role: 'ADMIN' } as never)
    expect(await hasBadge('u1', BADGES.MOD_TRACKS)).toBe(true)
    expect(badgeFind).not.toHaveBeenCalled()
  })

  it('unbekannter User → false', async () => {
    userFind.mockResolvedValue(null as never)
    expect(await hasBadge('ghost', BADGES.VERIFIED)).toBe(false)
  })

  it('Nicht-Admin mit vorhandenem Badge → true', async () => {
    userFind.mockResolvedValue({ role: 'KUENSTLER' } as never)
    badgeFind.mockResolvedValue({ id: 'b1' } as never)
    expect(await hasBadge('u2', BADGES.ARTIST_UPLOAD)).toBe(true)
  })

  it('Nicht-Admin ohne Badge → false', async () => {
    userFind.mockResolvedValue({ role: 'MITGLIED' } as never)
    badgeFind.mockResolvedValue(null as never)
    expect(await hasBadge('u3', BADGES.ARTIST_UPLOAD)).toBe(false)
  })
})

describe('requireBadge', () => {
  it('wirft PermissionError, wenn das Badge fehlt', async () => {
    userFind.mockResolvedValue({ role: 'MITGLIED' } as never)
    badgeFind.mockResolvedValue(null as never)
    await expect(requireBadge('u1', BADGES.MOD_EVENTS)).rejects.toBeInstanceOf(PermissionError)
  })

  it('passt durch, wenn das Badge da ist', async () => {
    userFind.mockResolvedValue({ role: 'ADMIN' } as never)
    await expect(requireBadge('admin', BADGES.MOD_EVENTS)).resolves.toBeUndefined()
  })
})

describe('requireTier (linearer Vergleich T0 < T1 < T2)', () => {
  it('höherer/gleicher Tier passt durch', async () => {
    userFind.mockResolvedValue({ trustTier: 'T2' } as never)
    await expect(requireTier('u1', 'T1')).resolves.toBeUndefined()
    userFind.mockResolvedValue({ trustTier: 'T1' } as never)
    await expect(requireTier('u1', 'T1')).resolves.toBeUndefined()
  })

  it('niedrigerer Tier wirft PermissionError', async () => {
    userFind.mockResolvedValue({ trustTier: 'T1' } as never)
    await expect(requireTier('u1', 'T2')).rejects.toBeInstanceOf(PermissionError)
  })

  it('unbekannter User wirft PermissionError', async () => {
    userFind.mockResolvedValue(null as never)
    await expect(requireTier('ghost', 'T1')).rejects.toBeInstanceOf(PermissionError)
  })
})
