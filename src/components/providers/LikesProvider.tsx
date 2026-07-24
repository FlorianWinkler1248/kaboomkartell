'use client';

/**
 * LikesProvider — globaler Aura+-Like-Zustand (ADR-041).
 *
 * Eine Geste, zwei Speicher:
 *  - Anonym: Likes leben als Track-Snapshots im localStorage
 *    (lib/session-likes.ts), Register-Nudge-Toast beim ersten Like
 *    (1× pro Browser-Session).
 *  - Eingeloggt: Likes = Aura+-Votes vom Server (/api/me/playlist);
 *    toggleLike schreibt über die bestehende Vote-Route (sus bleibt erhalten).
 *  - Auto-Import: sobald eine Session da ist UND Session-Likes existieren,
 *    werden sie einmalig über /api/me/playlist/import übernommen
 *    (LOCAL nur mit >= 60s Hörzeit — Server erzwingt das).
 *
 * Sitzt UNTER dem PlayerProvider (braucht listenedSeconds fürs ehrliche
 * Hörzeit-Tracking der Session-Likes) und UNTER dem ToastProvider.
 * Der PlayerProvider selbst bleibt unangetastet.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { useToast } from '@/components/providers/ToastProvider';
import {
  loadSessionLikes,
  toggleSessionLike,
  bumpSessionLikeListened,
  clearSessionLikes,
  type SessionLike,
} from '@/lib/session-likes';
import { VOTING_CONFIG } from '@/lib/constants';

/** Track-Snapshot, den ein Like-Button mitbringt (client-seitig verfügbar). */
export interface LikeInput {
  id: string;
  title: string;
  slug?: string | null;
  trackType: string;
  duration?: number;
  coverUrl?: string | null;
  genre?: string | null;
  artistLabel: string;
  soundcloudUrl?: string | null;
  soundcloudEmbedUrl?: string | null;
}

/** Einheitliche Sicht auf einen gelikten Track (Session ODER Server). */
export interface LikedTrack {
  id: string;
  title: string;
  slug: string | null;
  trackType: string;
  duration: number;
  coverUrl: string | null;
  genre: string | null;
  artistLabel: string;
  streamUrl: string;
  soundcloudUrl: string | null;
  soundcloudEmbedUrl: string | null;
  sus: boolean;
  likedAt: string;
}

interface LikesContextType {
  /** true solange keine Session existiert (Likes = localStorage). */
  isAnon: boolean;
  /** false bis der erste Load (localStorage bzw. API) durch ist. */
  ready: boolean;
  likedIds: Set<string>;
  likedTracks: LikedTrack[];
  toggleLike: (track: LikeInput) => Promise<void>;
  refresh: () => Promise<void>;
}

const LikesContext = createContext<LikesContextType | null>(null);

export function useMyPlaylist() {
  const ctx = useContext(LikesContext);
  if (!ctx) {
    throw new Error('useMyPlaylist must be used within LikesProvider');
  }
  return ctx;
}

const NUDGE_FLAG = 'kbk_like_nudge_shown';

function sessionLikeToLikedTrack(l: SessionLike): LikedTrack {
  return {
    id: l.trackId,
    title: l.title,
    slug: l.slug,
    trackType: l.trackType,
    duration: l.duration,
    coverUrl: l.coverUrl,
    genre: l.genre,
    artistLabel: l.artistLabel,
    streamUrl: l.trackType === 'LOCAL' ? `/api/tracks/${l.trackId}/stream` : '',
    soundcloudUrl: l.soundcloudUrl,
    soundcloudEmbedUrl: l.soundcloudEmbedUrl,
    sus: false,
    likedAt: l.likedAt,
  };
}

export default function LikesProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const { audio, listenedSeconds } = usePlayer();
  const { toast } = useToast();
  const t = useTranslations('player');
  const tMy = useTranslations('myPlaylist');

  const isAnon = !session?.user;
  const [ready, setReady] = useState(false);
  const [likedTracks, setLikedTracks] = useState<LikedTrack[]>([]);
  const importInFlightRef = useRef(false);

  const likedIds = useMemo(
    () => new Set(likedTracks.map((t2) => t2.id)),
    [likedTracks]
  );

  // === Laden: localStorage (anon) bzw. Server (eingeloggt) ===
  const refresh = useCallback(async () => {
    if (!session?.user) {
      setLikedTracks(loadSessionLikes().map(sessionLikeToLikedTrack));
      setReady(true);
      return;
    }
    try {
      const res = await fetch('/api/me/playlist');
      const json = await res.json();
      if (json.success) {
        setLikedTracks(json.data.tracks as LikedTrack[]);
      }
    } catch {
      // Netzfehler: Zustand behalten, nächster Refresh heilt.
    } finally {
      setReady(true);
    }
  }, [session?.user]);

  useEffect(() => {
    if (status === 'loading') return;
    refresh();
  }, [status, refresh]);

  // === Auto-Import der Session-Likes nach Login/Registrierung ===
  useEffect(() => {
    if (status !== 'authenticated' || importInFlightRef.current) return;
    const sessionLikes = loadSessionLikes();
    if (sessionLikes.length === 0) return;
    importInFlightRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/me/playlist/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            likes: sessionLikes.map((l) => ({
              trackId: l.trackId,
              listenedSeconds: l.listenedSeconds,
            })),
          }),
        });
        const json = await res.json();
        if (json.success) {
          clearSessionLikes();
          const { imported, skipped } = json.data as { imported: number; skipped: number };
          if (imported > 0) {
            toast({ type: 'success', message: tMy('importSuccess', { count: imported }) });
          }
          if (skipped > 0) {
            toast({ type: 'info', message: tMy('importSkipped', { count: skipped }) });
          }
          await refresh();
        }
        // 403 (T0, Email unverifiziert): Likes im localStorage lassen —
        // nach der Email-Verifikation greift der nächste Anlauf.
      } catch {
        // Netzfehler: nichts löschen, nächster Mount versucht es erneut.
      } finally {
        importInFlightRef.current = false;
      }
    })();
  }, [status, refresh, toast, tMy]);

  // === Ehrliches Hörzeit-Tracking für anonyme Session-Likes ===
  // Sobald der laufende (gelikte) Track die 60s-Schwelle überschreitet, wird
  // die Hörzeit im Snapshot nachgeführt — Basis für den späteren Import.
  const currentId = audio.currentTrack?.id ?? null;
  useEffect(() => {
    if (!isAnon || !currentId) return;
    if (listenedSeconds < VOTING_CONFIG.minListenSeconds) return;
    if (!likedIds.has(currentId)) return;
    bumpSessionLikeListened(currentId, listenedSeconds);
    // likedIds ist von likedTracks abgeleitet — bump ändert nur localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnon, currentId, listenedSeconds >= VOTING_CONFIG.minListenSeconds]);

  // === Like togglen ===
  const toggleLike = useCallback(
    async (track: LikeInput) => {
      if (!session?.user) {
        // Anonym: Snapshot in den localStorage, Nudge 1× pro Browser-Session.
        const result = toggleSessionLike({
          trackId: track.id,
          likedAt: new Date().toISOString(),
          listenedSeconds:
            audio.currentTrack?.id === track.id ? listenedSeconds : 0,
          title: track.title,
          slug: track.slug ?? null,
          trackType: track.trackType,
          duration: track.duration ?? 0,
          coverUrl: track.coverUrl ?? null,
          genre: track.genre ?? null,
          artistLabel: track.artistLabel,
          soundcloudUrl: track.soundcloudUrl ?? null,
          soundcloudEmbedUrl: track.soundcloudEmbedUrl ?? null,
        });
        setLikedTracks(result.likes.map(sessionLikeToLikedTrack));
        if (result.liked && typeof window !== 'undefined') {
          try {
            if (!window.sessionStorage.getItem(NUDGE_FLAG)) {
              window.sessionStorage.setItem(NUDGE_FLAG, '1');
              toast({ type: 'info', message: t('mine.emptyAnonToast') });
            }
          } catch {
            // sessionStorage gesperrt → Nudge einfach weglassen.
          }
        }
        return;
      }

      // Eingeloggt: Vote-Route (aura togglen, sus des bestehenden Votes erhalten).
      const wasLiked = likedIds.has(track.id);
      const existing = likedTracks.find((t2) => t2.id === track.id);
      // Optimistic Update
      setLikedTracks((prev) =>
        wasLiked
          ? prev.filter((t2) => t2.id !== track.id)
          : [
              {
                ...sessionLikeToLikedTrack({
                  trackId: track.id,
                  likedAt: new Date().toISOString(),
                  listenedSeconds: 0,
                  title: track.title,
                  slug: track.slug ?? null,
                  trackType: track.trackType,
                  duration: track.duration ?? 0,
                  coverUrl: track.coverUrl ?? null,
                  genre: track.genre ?? null,
                  artistLabel: track.artistLabel,
                  soundcloudUrl: track.soundcloudUrl ?? null,
                  soundcloudEmbedUrl: track.soundcloudEmbedUrl ?? null,
                }),
              },
              ...prev,
            ]
      );
      try {
        const res = await fetch(`/api/tracks/${track.id}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aura: !wasLiked,
            sus: existing?.sus ?? false,
            // Bestands-Muster der AURA-Pill (MiniPlayer): Backend-Min ist 60.
            listenedSeconds:
              track.trackType === 'SOUNDCLOUD'
                ? (audio.currentTrack?.id === track.id ? listenedSeconds : 0)
                : Math.max(
                    VOTING_CONFIG.minListenSeconds,
                    audio.currentTrack?.id === track.id ? listenedSeconds : 0
                  ),
          }),
        });
        if (!res.ok) {
          await refresh(); // Revert auf Server-Wahrheit
        }
      } catch {
        await refresh();
      }
    },
    [session?.user, likedIds, likedTracks, audio.currentTrack?.id, listenedSeconds, toast, t, refresh]
  );

  const value = useMemo<LikesContextType>(
    () => ({ isAnon, ready, likedIds, likedTracks, toggleLike, refresh }),
    [isAnon, ready, likedIds, likedTracks, toggleLike, refresh]
  );

  return <LikesContext.Provider value={value}>{children}</LikesContext.Provider>;
}
