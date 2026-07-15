'use client';

/**
 * useKeyboardShortcuts Hook
 *
 * Globale Tastaturkürzel für den Audio-Player.
 * Aktiv auf allen Seiten, solange kein Input/Textarea fokussiert ist.
 *
 * Shortcuts:
 * - Space:       Play/Pause
 * - ArrowLeft:   5 Sekunden zurück
 * - ArrowRight:  5 Sekunden vor
 * - ArrowUp:     Lautstärke +5%
 * - ArrowDown:   Lautstärke -5%
 * - N:           Nächster Track
 * - P:           Vorheriger Track
 * - S:           Shuffle umschalten
 * - R:           Repeat-Modus durchschalten
 * - M:           Mute/Unmute
 */

import { useEffect, useRef } from 'react';

interface KeyboardShortcutActions {
  togglePlay: () => void;
  seekForward: () => void;
  seekBackward: () => void;
  volumeUp: () => void;
  volumeDown: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleMute: () => void;
}

export function useKeyboardShortcuts(actions: KeyboardShortcutActions) {
  // Refs verwenden damit wir immer die aktuellsten Callbacks haben
  // (vermeidet Stale-Closure-Probleme)
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Nicht reagieren wenn ein Input oder Textarea fokussiert ist
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.isContentEditable
      ) {
        return;
      }

      // Nicht reagieren bei Modifier-Keys (Ctrl, Alt, Meta)
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      const a = actionsRef.current;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          a.togglePlay();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          a.seekBackward();
          break;

        case 'ArrowRight':
          e.preventDefault();
          a.seekForward();
          break;

        case 'ArrowUp':
          e.preventDefault();
          a.volumeUp();
          break;

        case 'ArrowDown':
          e.preventDefault();
          a.volumeDown();
          break;

        case 'n':
        case 'N':
          a.nextTrack();
          break;

        case 'p':
        case 'P':
          a.prevTrack();
          break;

        case 's':
        case 'S':
          a.toggleShuffle();
          break;

        case 'r':
        case 'R':
          a.cycleRepeat();
          break;

        case 'm':
        case 'M':
          a.toggleMute();
          break;

        default:
          // Andere Tasten ignorieren
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
