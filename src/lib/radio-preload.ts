/**
 * Radio Sync v3 (ADR-040) — Voll-Blob-Preload des gelockten nächsten Tracks.
 *
 * Seit ADR-033 kennt der Client den N+1-Track die gesamte Laufzeit vorher —
 * dieser Cache lädt ihn EINMAL vollständig als In-Memory-Blob und macht den
 * Track-Übergang zu einer lokalen Operation (kein Netz-Stall am Wechsel).
 *
 * Eigenschaften:
 *  - single-flight: pro Track-Id läuft höchstens ein Fetch
 *  - AbortController + Timeout: hängende Downloads werden hart abgebrochen
 *  - LRU max 2 Einträge: der älteste Blob wird beim Verdrängen revoked
 *    (max 2 reicht: der spielende Blob ist immer der zweitneueste Eintrag)
 *  - Auto-Kill: 3 Fehlschläge in Folge → Session-Disable (Fallback = Netz-URL)
 *  - fetch/createObjectURL/revokeObjectURL injizierbar → ohne Browser testbar
 */

export interface PreloadDeps {
  fetchFn?: typeof fetch
  createObjectURL?: (blob: Blob) => string
  revokeObjectURL?: (url: string) => void
  /** Download-Timeout (ms); danach Abort. */
  timeoutMs?: number
}

export interface RadioPreloader {
  /** Startet (falls nötig) den Voll-Download; liefert die Blob-URL oder null. */
  ensure(id: string, url: string): Promise<string | null>
  /** Synchroner Cache-Lookup: Blob-URL für die Track-Id oder null. */
  resolve(id: string): string | null
  /** Bricht den laufenden In-Flight-Fetch ab (zählt NICHT als Fehlschlag). */
  cancel(): void
  /** Revoked alle gecachten Blobs — außer der gerade aktiv gespielten URL. */
  releaseAll(exceptUrl?: string): void
  /** true, wenn der Preload für diese Session deaktiviert wurde (Auto-Kill). */
  isSessionDisabled(): boolean
  /** Session-Disable von außen (z.B. Blob-Playback-`error` in useRadioSync). */
  disableSession(reason: string): void
}

const MAX_CACHE_ENTRIES = 2
const MAX_CONSECUTIVE_FAILURES = 3
const DEFAULT_TIMEOUT_MS = 60_000

interface InFlight {
  promise: Promise<string | null>
  controller: AbortController
  cancelled: boolean
}

export function createRadioPreloader(deps: PreloadDeps = {}): RadioPreloader {
  const fetchFn = deps.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const createUrl = deps.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob))
  const revokeUrl = deps.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url))
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // Map hält Einfüge-Reihenfolge → ältester Eintrag = erster Key (LRU).
  const cache = new Map<string, string>()
  let inFlight: InFlight | null = null
  let inFlightId: string | null = null
  let consecutiveFailures = 0
  let sessionDisabled = false

  function put(id: string, blobUrl: string): void {
    cache.delete(id)
    cache.set(id, blobUrl)
    while (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value as string
      const url = cache.get(oldest)
      cache.delete(oldest)
      if (url) revokeUrl(url)
    }
  }

  function noteFailure(): void {
    consecutiveFailures += 1
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !sessionDisabled) {
      sessionDisabled = true
      console.warn(`[radio-preload] ${MAX_CONSECUTIVE_FAILURES} Preload-Fehlschläge in Folge — Blob-Preload für diese Session deaktiviert.`)
    }
  }

  return {
    ensure(id: string, url: string): Promise<string | null> {
      if (sessionDisabled) return Promise.resolve(null)
      const cached = cache.get(id)
      if (cached) return Promise.resolve(cached)
      // single-flight: laufender Fetch für dieselbe Id wird wiederverwendet.
      if (inFlight && inFlightId === id) return inFlight.promise

      const controller = new AbortController()
      const entry: InFlight = { controller, cancelled: false, promise: Promise.resolve(null) }
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      entry.promise = (async (): Promise<string | null> => {
        try {
          const res = await fetchFn(url, { signal: controller.signal })
          if (!res.ok) { noteFailure(); return null }
          const blob = await res.blob()
          const blobUrl = createUrl(blob)
          consecutiveFailures = 0
          put(id, blobUrl)
          return blobUrl
        } catch {
          // Expliziter cancel() ist Cleanup, kein Fehlschlag; Timeout/Netz-Fehler zählen.
          if (!entry.cancelled) noteFailure()
          return null
        } finally {
          clearTimeout(timer)
          if (inFlight === entry) { inFlight = null; inFlightId = null }
        }
      })()

      inFlight = entry
      inFlightId = id
      return entry.promise
    },

    resolve(id: string): string | null {
      return cache.get(id) ?? null
    },

    cancel(): void {
      if (!inFlight) return
      inFlight.cancelled = true
      inFlight.controller.abort()
      inFlight = null
      inFlightId = null
    },

    releaseAll(exceptUrl?: string): void {
      for (const [id, url] of [...cache]) {
        if (url === exceptUrl) continue
        cache.delete(id)
        revokeUrl(url)
      }
    },

    isSessionDisabled(): boolean {
      return sessionDisabled
    },

    disableSession(reason: string): void {
      if (sessionDisabled) return
      sessionDisabled = true
      console.warn(`[radio-preload] Session-Disable: ${reason}`)
    },
  }
}

/** Netz-Situations-Check: kein Voll-Preload bei Data-Saver oder 2G-Verbindung.
 *  API fehlt (iOS/Safari) → true (Preload erlaubt — dort keine Signale verfügbar). */
export function shouldPreload(nav?: { connection?: { saveData?: boolean; effectiveType?: string } }): boolean {
  const conn = nav?.connection
  if (!conn) return true
  if (conn.saveData) return false
  if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return false
  return true
}

/** App-weiter Singleton — useRadioSync nutzt genau diese Instanz. */
export const radioPreloader = createRadioPreloader()
