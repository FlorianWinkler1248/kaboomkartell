/**
 * Tests für den Radio-Sync-v3-Blob-Preloader (ADR-040) — rein, ohne Browser:
 * fetch + createObjectURL/revokeObjectURL werden injiziert.
 * Lauf: pnpm exec vitest run src/lib/__tests__/radio-preload.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import { createRadioPreloader, shouldPreload, type PreloadDeps } from '../radio-preload'

/** Test-Harness: Preloader mit gemockten Deps + Zugriff auf die Mock-Zähler. */
function harness(overrides: Partial<PreloadDeps> & { fetchImpl?: typeof fetch } = {}) {
  let urlCounter = 0
  const revoked: string[] = []
  const fetchOk = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(['audio-daten']),
  }) as unknown as Response)

  const deps: PreloadDeps = {
    fetchFn: (overrides.fetchImpl ?? fetchOk) as typeof fetch,
    createObjectURL: () => `blob:mock-${++urlCounter}`,
    revokeObjectURL: (url: string) => { revoked.push(url) },
    timeoutMs: overrides.timeoutMs ?? 5_000,
  }
  return { preloader: createRadioPreloader(deps), fetchOk, revoked }
}

describe('createRadioPreloader', () => {
  it('Erfolg: ensure lädt den Blob, resolve liefert die Blob-URL', async () => {
    const { preloader } = harness()
    const url = await preloader.ensure('track-A', '/api/tracks/A/stream')
    expect(url).toBe('blob:mock-1')
    expect(preloader.resolve('track-A')).toBe('blob:mock-1')
  })

  it('HTTP-Fehler (!ok): ensure liefert null, nichts gecacht', async () => {
    const fetchFail = vi.fn(async () => ({ ok: false }) as unknown as Response)
    const { preloader } = harness({ fetchImpl: fetchFail as typeof fetch })
    expect(await preloader.ensure('track-A', '/x')).toBeNull()
    expect(preloader.resolve('track-A')).toBeNull()
  })

  it('Timeout/Abort: hängender Fetch wird abgebrochen → null', async () => {
    // Fetch, der nie antwortet, aber das Abort-Signal respektiert.
    const fetchHang = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }))
    const { preloader } = harness({ fetchImpl: fetchHang as unknown as typeof fetch, timeoutMs: 10 })
    expect(await preloader.ensure('track-A', '/x')).toBeNull()
    expect(preloader.resolve('track-A')).toBeNull()
  })

  it('blob()-Throw (z.B. Abbruch mid-Download): ensure liefert null', async () => {
    const fetchBlobThrow = vi.fn(async () => ({
      ok: true,
      blob: async () => { throw new Error('network died mid-body') },
    }) as unknown as Response)
    const { preloader } = harness({ fetchImpl: fetchBlobThrow as typeof fetch })
    expect(await preloader.ensure('track-A', '/x')).toBeNull()
  })

  it('single-flight: zweites ensure für dieselbe Id startet KEINEN zweiten Fetch', async () => {
    const { preloader, fetchOk } = harness()
    const [a, b] = await Promise.all([
      preloader.ensure('track-A', '/x'),
      preloader.ensure('track-A', '/x'),
    ])
    expect(a).toBe(b)
    expect(fetchOk).toHaveBeenCalledTimes(1)
    // Gecachter Eintrag → ebenfalls kein neuer Fetch.
    await preloader.ensure('track-A', '/x')
    expect(fetchOk).toHaveBeenCalledTimes(1)
  })

  it('LRU max 2: dritter Eintrag verdrängt den ältesten und revoked dessen Blob-URL', async () => {
    const { preloader, revoked } = harness()
    await preloader.ensure('track-A', '/a')
    await preloader.ensure('track-B', '/b')
    await preloader.ensure('track-C', '/c')
    expect(revoked).toEqual(['blob:mock-1'])
    expect(preloader.resolve('track-A')).toBeNull()
    expect(preloader.resolve('track-B')).toBe('blob:mock-2')
    expect(preloader.resolve('track-C')).toBe('blob:mock-3')
  })

  it('releaseAll(exceptUrl) schont die aktiv gespielte URL, revoked den Rest', async () => {
    const { preloader, revoked } = harness()
    await preloader.ensure('track-A', '/a')
    await preloader.ensure('track-B', '/b')
    preloader.releaseAll('blob:mock-2')
    expect(revoked).toEqual(['blob:mock-1'])
    expect(preloader.resolve('track-A')).toBeNull()
    expect(preloader.resolve('track-B')).toBe('blob:mock-2')
  })

  it('Auto-Kill: 3 Fehlschläge in Folge → sessionDisabled, weitere ensure sind No-Ops', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const fetchFail = vi.fn(async () => ({ ok: false }) as unknown as Response)
      const { preloader } = harness({ fetchImpl: fetchFail as typeof fetch })
      await preloader.ensure('t1', '/1')
      expect(preloader.isSessionDisabled()).toBe(false)
      await preloader.ensure('t2', '/2')
      await preloader.ensure('t3', '/3')
      expect(preloader.isSessionDisabled()).toBe(true)
      // Session tot → kein weiterer Fetch mehr.
      await preloader.ensure('t4', '/4')
      expect(fetchFail).toHaveBeenCalledTimes(3)
    } finally {
      warn.mockRestore()
    }
  })

  it('expliziter cancel() zählt NICHT als Fehlschlag (kein Auto-Kill durch Cleanup)', async () => {
    const fetchHang = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }))
    const { preloader } = harness({ fetchImpl: fetchHang as unknown as typeof fetch })
    const p1 = preloader.ensure('t1', '/1'); preloader.cancel(); await p1
    const p2 = preloader.ensure('t2', '/2'); preloader.cancel(); await p2
    const p3 = preloader.ensure('t3', '/3'); preloader.cancel(); await p3
    expect(preloader.isSessionDisabled()).toBe(false)
  })
})

describe('shouldPreload', () => {
  it('Matrix: saveData/2g/slow-2g → false; 4g → true; API fehlt (iOS) → true', () => {
    expect(shouldPreload({ connection: { saveData: true } })).toBe(false)
    expect(shouldPreload({ connection: { effectiveType: '2g' } })).toBe(false)
    expect(shouldPreload({ connection: { effectiveType: 'slow-2g' } })).toBe(false)
    expect(shouldPreload({ connection: { effectiveType: '4g', saveData: false } })).toBe(true)
    expect(shouldPreload({ connection: {} })).toBe(true)
    expect(shouldPreload(undefined)).toBe(true)
    expect(shouldPreload({})).toBe(true)
  })
})
