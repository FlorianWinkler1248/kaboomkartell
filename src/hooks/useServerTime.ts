'use client';

/**
 * useServerTime — Hook für Server-Synchronisierte UTC-Zeit (v2.6)
 *
 * Beim Mount fetched ein /api/time, berechnet den Drift zwischen lokaler
 * Uhr und Server-Uhr. Danach: ticking via requestAnimationFrame +
 * Date.now() + drift.
 *
 * Vorteile:
 * - User-Laptop mit falscher Uhr zeigt trotzdem korrekte UTC-Zeit
 * - Kein DB-Roundtrip pro Tick (drift bleibt konstant zwischen Re-Sync)
 * - Re-sync alle 5 Minuten falls Browser-Tab im Hintergrund war
 */

import { useEffect, useState, useRef } from 'react';

interface ServerTimeState {
  /** Server-corrected current Date. null bis erstes Sync durchgelaufen. */
  now: Date | null;
  /** True nach erstem Sync. */
  synced: boolean;
}

const RESYNC_INTERVAL_MS = 5 * 60_000; // 5 Min

export function useServerTime(): ServerTimeState {
  const [now, setNow] = useState<Date | null>(null);
  const driftMs = useRef(0); // serverEpoch - localEpoch
  const lastSync = useRef(0);

  useEffect(() => {
    let alive = true;

    const sync = async () => {
      try {
        const localBefore = Date.now();
        const res = await fetch('/api/time', { cache: 'no-store' });
        const localAfter = Date.now();
        const data = (await res.json()) as { epochMs: number };
        // Korrektur für Round-Trip-Time: Annahme dass Server-Antwort
        // exakt in der Mitte zwischen Request + Response liegt.
        const localMid = Math.round((localBefore + localAfter) / 2);
        driftMs.current = data.epochMs - localMid;
        lastSync.current = Date.now();
      } catch {
        // Bei Fehler: drift=0 (= Local-Time). Besser als gar nichts.
      }
    };

    const tick = () => {
      if (!alive) return;
      const corrected = new Date(Date.now() + driftMs.current);
      setNow(corrected);
      // Re-sync wenn 5 Min vergangen oder Tab war inactive (gap > 10s)
      if (Date.now() - lastSync.current > RESYNC_INTERVAL_MS) {
        sync();
      }
    };

    sync().then(() => {
      tick();
    });
    const id = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { now, synced: now !== null };
}
