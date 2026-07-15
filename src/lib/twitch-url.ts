/**
 * Helper rund um Twitch-URLs (v2.30, ADR-005 Sektion E).
 *
 * Wenn ein TimetableEvent vom Typ TWITCH aktiv ist, kommt `streamUrl` als
 * `https://www.twitch.tv/<channel>` rein. UI-Komponenten brauchen aber den
 * reinen Channel-Login (z. B. für Embed-URL oder Anzeige).
 */

const TWITCH_HOSTS = new Set(['twitch.tv', 'www.twitch.tv', 'm.twitch.tv']);

/**
 * Zieht den Channel-Login aus einer Twitch-URL.
 *
 * - `https://www.twitch.tv/kbk4flow` → `"kbk4flow"`
 * - `https://www.twitch.tv/kbk4flow/about` → `"kbk4flow"`
 * - `https://www.twitch.tv/videos/12345` → `null` (kein Live-Channel)
 * - leerer/ungültiger Input → `null`
 *
 * Channel-Login wird zu lowercase normalisiert (Twitch-Login-Konvention).
 */
export function extractTwitchChannelFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!TWITCH_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    const first = parsed.pathname.split('/').filter(Boolean)[0];
    if (!first) return null;
    // Reserved Pfade ("videos", "directory" etc.) sind keine Channels.
    if (['videos', 'directory', 'p', 'subs'].includes(first.toLowerCase())) return null;
    if (!/^[a-zA-Z0-9_]{2,25}$/.test(first)) return null;
    return first.toLowerCase();
  } catch {
    return null;
  }
}
