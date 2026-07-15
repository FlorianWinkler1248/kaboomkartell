'use client';

/**
 * RefBeacon — einmaliger, PII-freier Beacon (P0.8 / ADR-035).
 *
 * Feuert genau einmal pro Session, wenn die Seite mit `?ref=<quelle>` aufgerufen
 * wird (z.B. `?ref=mcp` aus den MCP-Deep-Links). sessionStorage-Guard verhindert
 * Doppelzählung bei Reload / Client-Navigation innerhalb derselben Session. Ohne
 * `?ref=` passiert NICHTS (kein Call). Rendert nichts.
 */

import { useEffect } from 'react';

export default function RefBeacon() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (!ref) return;
      const key = `kbk-ref-beacon:${ref}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      fetch('/api/metrics/ref', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // sessionStorage / URL nicht verfügbar → still ignorieren.
    }
  }, []);

  return null;
}
