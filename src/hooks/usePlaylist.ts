'use client';

/**
 * usePlaylist Hook
 *
 * Verwaltet die Playlist-Logik: Tracks, Shuffle, Repeat, Statistiken.
 * Migriert von der bestehenden MP3Player-Klasse.
 *
 * Originale Methoden-Zuordnung:
 * - MP3Player.songs[]              -> tracks[]
 * - MP3Player.currentSongIndex     -> currentIndex
 * - MP3Player.isShuffled           -> shuffleEnabled
 * - MP3Player.repeatMode           -> repeatMode
 * - MP3Player.playedSongs (Set)    -> playedTrackIds (Set)
 * - MP3Player.totalSongs           -> stats.total
 * - MP3Player.getNextSongIndex()   -> getNextIndex()
 * - MP3Player.getPrevSongIndex()   -> getPrevIndex()
 * - MP3Player.getRandomUnplayed()  -> getRandomUnplayedIndex()
 */

import { useState, useCallback, useMemo } from 'react';
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

  // Actions
  setTracks: (tracks: PlayerTrack[]) => void;
  addTracks: (newTracks: PlayerTrack[]) => void;
  removeTrack: (trackId: string) => void;
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
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [playedTrackIds, setPlayedTrackIds] = useState<Set<string>>(new Set());

  // === Statistiken (berechnet, wie im Original) ===
  const stats: PlayerStats = useMemo(() => {
    const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
    return {
      total: tracks.length,
      played: playedTrackIds.size,
      totalDuration,
    };
  }, [tracks, playedTrackIds]);

  // === Track als gespielt markieren ===
  const markAsPlayed = useCallback((trackId: string) => {
    setPlayedTrackIds((prev) => {
      const next = new Set(prev);
      next.add(trackId);
      return next;
    });
  }, []);

  // === Tracks setzen (ersetzt die gesamte Playlist) ===
  const setTracks = useCallback((newTracks: PlayerTrack[]) => {
    setTracksState(newTracks);
    setCurrentIndex(newTracks.length > 0 ? 0 : -1);
    setPlayedTrackIds(new Set());
  }, []);

  // === Tracks hinzufügen (z.B. Drag & Drop) ===
  const addTracks = useCallback((newTracks: PlayerTrack[]) => {
    setTracksState((prev) => [...prev, ...newTracks]);
  }, []);

  // === Track entfernen ===
  const removeTrack = useCallback((trackId: string) => {
    setTracksState((prev) => {
      const newTracks = prev.filter((t) => t.id !== trackId);
      return newTracks;
    });
    setPlayedTrackIds((prev) => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
  }, []);

  // === Playlist leeren ===
  const clearPlaylist = useCallback(() => {
    setTracksState([]);
    setCurrentIndex(-1);
    setPlayedTrackIds(new Set());
  }, []);

  // === Shuffle umschalten ===
  // Migriert von: MP3Player.toggleShuffle()
  const toggleShuffle = useCallback(() => {
    setShuffleEnabled((prev) => !prev);
  }, []);

  // === Repeat-Modus durchschalten: off -> all -> one -> off ===
  // Migriert von: MP3Player.cycleRepeatMode()
  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  }, []);

  /**
   * Gibt einen zufälligen Index zurück, der noch nicht gespielt wurde.
   * Migriert von: MP3Player.getRandomUnplayed()
   *
   * Wenn alle gespielt: Reset und neuer Zufallstrack (nicht der aktuelle).
   */
  const getRandomUnplayedIndex = useCallback((): number | null => {
    if (tracks.length === 0) return null;
    if (tracks.length === 1) return 0;

    // Finde ungeplayed Tracks (nicht den aktuellen)
    const unplayed = tracks
      .map((t, i) => ({ id: t.id, index: i }))
      .filter((item) => !playedTrackIds.has(item.id) && item.index !== currentIndex);

    if (unplayed.length > 0) {
      // Zufällig aus den ungespielten wählen
      const random = Math.floor(Math.random() * unplayed.length);
      return unplayed[random].index;
    }

    // Alle gespielt -> Reset (wie im Original)
    // Aber nicht den aktuellen Track nochmal
    setPlayedTrackIds(new Set());
    const available = tracks
      .map((_, i) => i)
      .filter((i) => i !== currentIndex);

    if (available.length === 0) return 0;
    return available[Math.floor(Math.random() * available.length)];
  }, [tracks, playedTrackIds, currentIndex]);

  /**
   * Nächster Track-Index basierend auf Repeat/Shuffle-Modus.
   * Migriert von: MP3Player.getNextSongIndex()
   *
   * Logik:
   * - repeat='one': gleicher Index
   * - shuffle=true: zufälliger unplayed
   * - repeat='all': wrap around
   * - repeat='off': null wenn am Ende
   */
  const getNextIndex = useCallback((): number | null => {
    if (tracks.length === 0) return null;

    // Repeat One -> gleicher Track
    if (repeatMode === 'one') {
      return currentIndex;
    }

    // Shuffle -> zufällig
    if (shuffleEnabled) {
      return getRandomUnplayedIndex();
    }

    // Normaler nächster Track
    const nextIndex = currentIndex + 1;

    if (nextIndex < tracks.length) {
      return nextIndex;
    }

    // Am Ende der Playlist
    if (repeatMode === 'all') {
      return 0; // Zurück zum Anfang
    }

    return null; // Playlist zu Ende
  }, [tracks.length, repeatMode, currentIndex, shuffleEnabled, getRandomUnplayedIndex]);

  /**
   * Vorheriger Track-Index.
   * Migriert von: MP3Player.getPrevSongIndex()
   */
  const getPrevIndex = useCallback((): number | null => {
    if (tracks.length === 0) return null;

    // Shuffle -> zufällig
    if (shuffleEnabled) {
      return getRandomUnplayedIndex();
    }

    const prevIndex = currentIndex - 1;

    if (prevIndex >= 0) {
      return prevIndex;
    }

    // Am Anfang der Playlist
    if (repeatMode === 'all') {
      return tracks.length - 1; // Zum Ende springen
    }

    return 0; // Bleibe beim ersten Track
  }, [tracks.length, currentIndex, shuffleEnabled, repeatMode, getRandomUnplayedIndex]);

  return {
    tracks,
    currentIndex,
    shuffleEnabled,
    repeatMode,
    playedTrackIds,
    stats,
    setTracks,
    addTracks,
    removeTrack,
    clearPlaylist,
    setCurrentIndex,
    markAsPlayed,
    toggleShuffle,
    cycleRepeatMode,
    getNextIndex,
    getPrevIndex,
  };
}
