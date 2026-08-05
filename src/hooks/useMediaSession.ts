'use client';

/**
 * useMediaSession Hook
 *
 * Integriert den Player mit der Browser MediaSession API.
 * Zeigt Track-Infos in:
 * - OS-Media-Controls (Lockscreen, Notification Area)
 * - Browser-Tab (Media-Popup)
 * - Bluetooth/Kopfhörer-Steuerung
 *
 * Setzt Metadata (Titel, Künstler, Cover) und Action-Handler
 * (play, pause, next, prev, seekto, seekforward, seekbackward).
 */

import { useEffect, useRef } from 'react';
import type { PlayerTrack } from '@/types';

interface MediaSessionActions {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
}

interface MediaSessionState {
  currentTrack: PlayerTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export function useMediaSession(
  state: MediaSessionState,
  actions: MediaSessionActions
) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Mobile-Continuity (v3.1): Position ebenfalls über Refs, damit die
  // Action-Handler an einem STABILEN Effect hängen können (siehe unten).
  const positionRef = useRef({ currentTime: state.currentTime, duration: state.duration });
  positionRef.current = { currentTime: state.currentTime, duration: state.duration };

  // Metadata aktualisieren wenn sich der Track ändert
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!state.currentTrack) return;

    const artwork: MediaImage[] = [];
    if (state.currentTrack.coverUrl) {
      artwork.push({
        src: state.currentTrack.coverUrl,
        sizes: '256x256',
        type: 'image/png',
      });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: state.currentTrack.title,
      artist: state.currentTrack.artist || 'KaboomKartell',
      album: 'KaboomKartell',
      artwork: artwork.length > 0 ? artwork : [
        {
          src: '/images/logo-4flow.png',
          sizes: '200x200',
          type: 'image/png',
        },
      ],
    });
  }, [state.currentTrack]);

  // Playback-State aktualisieren
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.playbackState = state.isPlaying
      ? 'playing'
      : 'paused';
  }, [state.isPlaying]);

  // Position-State aktualisieren (für Seek-Bar im OS)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!navigator.mediaSession.setPositionState) return;
    if (!state.duration || state.duration <= 0) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: state.duration,
        playbackRate: 1,
        position: Math.min(state.currentTime, state.duration),
      });
    } catch {
      // Einige Browser werfen bei ungültigem State
    }
  }, [state.currentTime, state.duration]);

  // Action-Handler registrieren.
  //
  // Mobile-Continuity (v3.1): Dieser Effect hängt bewusst an KEINER
  // veränderlichen Größe. Vorher standen `currentTime`/`duration` in den
  // Dependencies — bei ~4 timeupdate-Events pro Sekunde wurden damit alle
  // OS-Media-Handler viermal je Sekunde abgemeldet und neu gesetzt. Auf dem
  // Sperrbildschirm ist genau das der Unterschied zwischen „Play-Taste tut
  // etwas" und „Play-Taste tut nichts" — und die Play-Taste ist der Rettungs-
  // anker, wenn der Browser die Wiedergabe im Hintergrund abgelehnt hat.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => actionsRef.current.onPlay()],
      ['pause', () => actionsRef.current.onPause()],
      ['nexttrack', () => actionsRef.current.onNext()],
      ['previoustrack', () => actionsRef.current.onPrev()],
      ['seekto', (details) => {
        if (details.seekTime !== undefined) {
          actionsRef.current.onSeek(details.seekTime);
        }
      }],
      ['seekforward', () => {
        const { currentTime, duration } = positionRef.current;
        actionsRef.current.onSeek(Math.min(currentTime + 10, duration));
      }],
      ['seekbackward', () => {
        actionsRef.current.onSeek(Math.max(positionRef.current.currentTime - 10, 0));
      }],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Action nicht unterstützt in diesem Browser
      }
    }

    // Cleanup: Handler entfernen
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Ignorieren
        }
      }
    };
  }, []);
}
