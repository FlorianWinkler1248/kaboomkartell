'use client';

/**
 * usePlaylist Hook — die Warteschlange des Player-Modus.
 *
 * Der Hook hält den React-State (Titel-Liste, laufender Titel, Shuffle, Repeat);
 * die eigentliche Mechanik — wie sich die Abspiel-Reihenfolge daraus ergibt und
 * wohin „vor"/„zurück" führt — liegt als reine, getestete Funktionen in
 * `@/lib/player-queue`.
 *
 * Zwei Sichten auf dieselben Titel (Details dort):
 *  - `tracks` — was der Hörer sieht und umsortiert
 *  - `order`  — in welcher Folge gespielt wird (ohne Shuffle identisch)
 *
 * `currentIndex` bleibt bewusst der Index in `tracks` (nicht in `order`), damit
 * alle bestehenden Aufrufer unverändert weiterlaufen.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  identityOrder, shuffledOrder, nextCursor, prevCursor, upNextIndices,
  withShuffle, withRemovedTrack, withReorderedTracks, withAppendedTracks,
  type QueueState,
} from '@/lib/player-queue';
import type { PlayerTrack, PlayerStats } from '@/types';
import type { RepeatMode } from '@/lib/constants';

export interface UsePlaylistReturn {
  // State
  tracks: PlayerTrack[];
  currentIndex: number;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  playedTrackIds: Set<string>;
  stats: PlayerStats;
  /** Die kommenden Titel in Abspiel-Reihenfolge (speist „ALS NÄCHSTES"). */
  upNext: PlayerTrack[];

  // Actions
  setTracks: (tracks: PlayerTrack[]) => void;
  /**
   * Warteschlange samt Einstellungen wiederherstellen (Reload).
   *
   * Bewusst getrennt von `setTracks`: das hier startet KEINE Wiedergabe und
   * setzt den Cursor auf die gemerkte Stelle statt auf den Anfang. Der Hörer
   * findet seine Auswahl wieder, hört aber erst wieder Ton, wenn er es will.
   */
  restoreQueue: (state: {
    tracks: PlayerTrack[];
    currentIndex: number;
    shuffleEnabled: boolean;
    repeatMode: RepeatMode;
  }) => void;
  addTracks: (newTracks: PlayerTrack[]) => void;
  /**
   * Titel aus der Warteschlange nehmen.
   *
   * Meldet zurück, ob dabei der LAUFENDE Titel entfernt wurde und welcher jetzt
   * an der Reihe ist — denn dann muss die Wiedergabe umziehen. Ohne diese
   * Rückmeldung lief das entfernte Stück weiter zu Ende, und weil der Cursor
   * schon auf dem Nachfolger stand, sprang die Wiedergabe danach auf den
   * ÜBERnächsten: ein Titel wurde stillschweigend übersprungen.
   */
  removeTrack: (trackId: string) => { removedWasCurrent: boolean; nowPlaying: PlayerTrack | null };
  /** Titel in der sichtbaren Liste verschieben (Queue umsortieren). */
  moveTrack: (from: number, to: number) => void;
  clearPlaylist: () => void;
  setCurrentIndex: (index: number) => void;
  markAsPlayed: (trackId: string) => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  getNextIndex: () => number | null;
  getPrevIndex: () => number | null;
}

export function usePlaylist(): UsePlaylistReturn {
  const [tracks, setTracksState] = useState<PlayerTrack[]>([]);
  const [currentIndex, setCurrentIndexState] = useState(-1);
  const [order, setOrder] = useState<number[]>([]);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [playedTrackIds, setPlayedTrackIds] = useState<Set<string>>(new Set());

  // Refs für die Callbacks, die aus fremden Closures gerufen werden
  // (onTrackEnd im PlayerProvider läuft aus einem Audio-Event-Listener).
  const stateRef = useRef<QueueState>({ order: [], cursor: -1, shuffle: false, repeat: 'off' });
  stateRef.current = {
    order,
    cursor: order.indexOf(currentIndex),
    shuffle: shuffleEnabled,
    repeat: repeatMode,
  };

  // === Statistiken ===
  const stats: PlayerStats = useMemo(() => {
    const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
    return { total: tracks.length, played: playedTrackIds.size, totalDuration };
  }, [tracks, playedTrackIds]);

  // === „Als Nächstes" — max. 20 Einträge, mehr braucht keine Anzeige ===
  const upNext = useMemo(() => {
    const state: QueueState = {
      order,
      cursor: order.indexOf(currentIndex),
      shuffle: shuffleEnabled,
      repeat: repeatMode,
    };
    return upNextIndices(state, 20).map((i) => tracks[i]).filter(Boolean);
  }, [order, currentIndex, shuffleEnabled, repeatMode, tracks]);

  const markAsPlayed = useCallback((trackId: string) => {
    setPlayedTrackIds((prev) => {
      if (prev.has(trackId)) return prev;
      const next = new Set(prev);
      next.add(trackId);
      return next;
    });
  }, []);

  // === Tracks setzen (ersetzt die gesamte Warteschlange) ===
  const setTracks = useCallback((newTracks: PlayerTrack[]) => {
    setTracksState(newTracks);
    setCurrentIndexState(newTracks.length > 0 ? 0 : -1);
    setPlayedTrackIds(new Set());
    // Bei aktivem Shuffle wird die neue Warteschlange sofort gemischt — sonst
    // liefe die erste Runde geordnet, obwohl der Knopf leuchtet.
    setOrder(
      shuffleEnabled && newTracks.length > 0
        ? shuffledOrder(newTracks.length, Date.now(), 0)
        : identityOrder(newTracks.length),
    );
  }, [shuffleEnabled]);

  const restoreQueue = useCallback((state: {
    tracks: PlayerTrack[];
    currentIndex: number;
    shuffleEnabled: boolean;
    repeatMode: RepeatMode;
  }) => {
    if (state.tracks.length === 0) return;
    const index = Math.min(Math.max(state.currentIndex, 0), state.tracks.length - 1);
    setTracksState(state.tracks);
    setRepeatMode(state.repeatMode);
    setShuffleEnabled(state.shuffleEnabled);
    setPlayedTrackIds(new Set());
    // Die gemischte Reihenfolge selbst wird NICHT gespeichert — sie neu zu
    // würfeln ist beim Wiederaufnehmen erwartbar. Der aktuelle Titel bleibt
    // vorn, damit „weiter" nicht mitten in die Vergangenheit springt.
    setOrder(
      state.shuffleEnabled
        ? shuffledOrder(state.tracks.length, Date.now(), index)
        : identityOrder(state.tracks.length),
    );
    setCurrentIndexState(index);
  }, []);

  // === Tracks anhängen (z.B. Drag & Drop) ===
  const addTracks = useCallback((newTracks: PlayerTrack[]) => {
    if (newTracks.length === 0) return;
    setOrder(withAppendedTracks(stateRef.current, newTracks.length).order);
    setTracksState((prev) => [...prev, ...newTracks]);
  }, []);

  // === Track entfernen ===
  const removeTrack = useCallback((trackId: string) => {
    const trackIndex = tracks.findIndex((t) => t.id === trackId);
    if (trackIndex < 0) return { removedWasCurrent: false, nowPlaying: null };

    const removedWasCurrent = trackIndex === currentIndex;
    const next = withRemovedTrack(stateRef.current, trackIndex);
    // Genau EINEN Eintrag entfernen — nicht alle mit dieser Id. Die Engine
    // rechnet mit einer Position; würde die Liste zwei Einträge verlieren,
    // zeigte die Reihenfolge danach an der Liste vorbei.
    const newTracks = tracks.filter((_, i) => i !== trackIndex);
    const newCurrentIndex = next.cursor >= 0 ? next.order[next.cursor] ?? -1 : -1;

    setOrder(next.order);
    setCurrentIndexState(newCurrentIndex);
    setTracksState(newTracks);
    setPlayedTrackIds((prev) => {
      const set = new Set(prev);
      set.delete(trackId);
      return set;
    });

    return { removedWasCurrent, nowPlaying: newTracks[newCurrentIndex] ?? null };
  }, [tracks, currentIndex]);

  // === Queue umsortieren ===
  const moveTrack = useCallback((from: number, to: number) => {
    if (from < 0 || from >= tracks.length || to < 0 || to >= tracks.length || from === to) return;

    // mapping[neuePosition] = altePosition — genau das erwartet die Engine.
    const mapping = identityOrder(tracks.length);
    const [movedIndex] = mapping.splice(from, 1);
    mapping.splice(to, 0, movedIndex);

    const next = withReorderedTracks(stateRef.current, mapping);
    const reordered = [...tracks];
    const [track] = reordered.splice(from, 1);
    reordered.splice(to, 0, track);

    setTracksState(reordered);
    setOrder(next.order);
    setCurrentIndexState(next.cursor >= 0 ? next.order[next.cursor] ?? -1 : -1);
  }, [tracks]);

  const clearPlaylist = useCallback(() => {
    setTracksState([]);
    setCurrentIndexState(-1);
    setOrder([]);
    setPlayedTrackIds(new Set());
  }, []);

  // === Shuffle umschalten — mischt die Reihenfolge EINMAL, statt bei jedem
  //     Schritt neu zu würfeln. Der laufende Titel bleibt der laufende Titel. ===
  const toggleShuffle = useCallback(() => {
    const next = withShuffle(stateRef.current, !stateRef.current.shuffle, Date.now());
    setShuffleEnabled(next.shuffle);
    setOrder(next.order);
  }, []);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  }, []);

  const getNextIndex = useCallback((): number | null => {
    const cursor = nextCursor(stateRef.current);
    if (cursor === null) return null;
    return stateRef.current.order[cursor] ?? null;
  }, []);

  const getPrevIndex = useCallback((): number | null => {
    const cursor = prevCursor(stateRef.current);
    if (cursor === null) return null;
    return stateRef.current.order[cursor] ?? null;
  }, []);

  return {
    tracks,
    currentIndex,
    shuffleEnabled,
    repeatMode,
    playedTrackIds,
    stats,
    upNext,
    setTracks,
    restoreQueue,
    addTracks,
    removeTrack,
    moveTrack,
    clearPlaylist,
    setCurrentIndex: setCurrentIndexState,
    markAsPlayed,
    toggleShuffle,
    cycleRepeatMode,
    getNextIndex,
    getPrevIndex,
  };
}
