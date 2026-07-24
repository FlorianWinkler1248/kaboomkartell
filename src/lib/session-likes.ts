/**
 * Session-Likes — anonyme Aura+-Likes im localStorage (ADR-041).
 *
 * Anonyme Besucher können Tracks liken, ohne Account: die Likes leben als
 * kompakte Track-Snapshots unter `kbk_session_likes_v1` im Browser. Nach der
 * Registrierung bietet der Import-Endpoint (/api/me/playlist/import) die
 * Übernahme als echte Votes an — LOCAL-Tracks nur mit ehrlich getrackter
 * Hörzeit >= 60s (Kein-Blenden-Regel), SOUNDCLOUD ohne Hörzeit-Pflicht
 * (läuft im SC-Widget, unmessbar).
 *
 * Client-safe: kein prisma, kein Node-API. Die pure Kern-Logik
 * (toggleInList/capList) ist exportiert und getestet.
 */

const STORAGE_KEY = 'kbk_session_likes_v1';
const STORAGE_VERSION = 1;
export const SESSION_LIKES_CAP = 100;

export interface SessionLike {
  trackId: string;
  likedAt: string; // ISO
  /** Höchste beim Liken/Hören getrackte Hörzeit — Basis für den ehrlichen Import. */
  listenedSeconds: number;
  // Kompakter Track-Snapshot, damit die Session-Playlist ohne API-Roundtrip rendert.
  title: string;
  slug: string | null;
  trackType: string;
  duration: number;
  coverUrl: string | null;
  genre: string | null;
  artistLabel: string;
  soundcloudUrl: string | null;
  soundcloudEmbedUrl: string | null;
}

interface StoredShape {
  v: number;
  likes: SessionLike[];
}

// === Pure Kern-Logik (testbar, kein localStorage) ===

/** Like togglen: vorhanden → entfernen, sonst vorne anfügen. */
export function toggleInList(
  likes: SessionLike[],
  like: SessionLike
): { liked: boolean; likes: SessionLike[] } {
  const exists = likes.some((l) => l.trackId === like.trackId);
  if (exists) {
    return { liked: false, likes: likes.filter((l) => l.trackId !== like.trackId) };
  }
  return { liked: true, likes: capList([like, ...likes]) };
}

/** Cap durchsetzen — älteste (hinten) fliegen zuerst raus. */
export function capList(likes: SessionLike[]): SessionLike[] {
  return likes.length > SESSION_LIKES_CAP ? likes.slice(0, SESSION_LIKES_CAP) : likes;
}

/** Hörzeit eines vorhandenen Likes nachführen (nur nach oben). */
export function bumpListenedInList(
  likes: SessionLike[],
  trackId: string,
  listenedSeconds: number
): SessionLike[] {
  return likes.map((l) =>
    l.trackId === trackId && listenedSeconds > l.listenedSeconds
      ? { ...l, listenedSeconds }
      : l
  );
}

// === localStorage-Wrapper (SSR-safe) ===

export function loadSessionLikes(): SessionLike[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed?.v !== STORAGE_VERSION || !Array.isArray(parsed.likes)) return [];
    return parsed.likes.filter((l) => typeof l?.trackId === 'string');
  } catch {
    return [];
  }
}

export function saveSessionLikes(likes: SessionLike[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: STORAGE_VERSION, likes: capList(likes) } satisfies StoredShape)
    );
  } catch {
    // Quota/Private-Mode — Session-Likes sind nice-to-have, kein Fehlerfall.
  }
}

export function toggleSessionLike(like: SessionLike): { liked: boolean; likes: SessionLike[] } {
  const result = toggleInList(loadSessionLikes(), like);
  saveSessionLikes(result.likes);
  return result;
}

export function bumpSessionLikeListened(trackId: string, listenedSeconds: number): void {
  const likes = loadSessionLikes();
  const next = bumpListenedInList(likes, trackId, listenedSeconds);
  if (next !== likes) saveSessionLikes(next);
}

export function clearSessionLikes(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignorieren
  }
}
