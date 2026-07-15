'use client';

/**
 * useAudioPlayer Hook
 *
 * Kern-Audio-Logik, migriert von der bestehenden MP3Player-Klasse.
 * Verwaltet das HTMLAudioElement, Play/Pause, Seek, Volume.
 *
 * Originale Methoden-Zuordnung:
 * - MP3Player.togglePlay()     -> togglePlay()
 * - MP3Player.playSong(index)  -> play(track)
 * - MP3Player.updateProgress() -> timeupdate Event -> setCurrentTime
 * - MP3Player.updateDuration() -> loadedmetadata Event -> setDuration
 * - Volume Slider              -> setVolume()
 * - Progress Bar Click         -> seek()
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { PlayerTrack } from '@/types';

interface UseAudioPlayerOptions {
  onTrackEnd?: () => void;
}

export interface UseAudioPlayerReturn {
  // State
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  currentTrack: PlayerTrack | null;

  // Refs
  audioRef: React.RefObject<HTMLAudioElement | null>;

  // Actions
  play: (track: PlayerTrack) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seek: (timeInSeconds: number) => void;
  seekPercent: (percent: number) => void;
  setVolume: (volume: number) => void;
  /** Radio Sync v2: Tempo-Nudge für den PLL-Beatmatch. Setzt audio.playbackRate
   *  direkt am Element (kein Re-Render). preservesPitch hält die Tonhöhe. */
  setPlaybackRate: (rate: number) => void;
}

/** preservesPitch (+ Vendor-Prefixe) setzen: bei Tempo-Nudge bleibt die Tonhöhe
 *  gleich (Tempo-only Beatmatch). Wird bei Element-Erstellung + bei jedem play()
 *  gesetzt, da manche Browser den Wert beim src-Wechsel zurücksetzen. */
function applyPreservesPitch(el: HTMLAudioElement): void {
  const a = el as HTMLAudioElement & { mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean };
  a.preservesPitch = true;
  a.mozPreservesPitch = true;
  a.webkitPreservesPitch = true;
}

export function useAudioPlayer(options: UseAudioPlayerOptions = {}): UseAudioPlayerReturn {
  const { onTrackEnd } = options;

  // Audio Element Ref
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.7); // Default 70% (wie original)
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);

  // Play-Generation-Token: schützt vor AbortError-Races bei schnellem Track-Wechsel.
  // Jeder play()/resume()-Aufruf erhöht den Token; eine von einem neuen Aufruf
  // überholte play()-Promise (AbortError) wird verworfen statt als Fehler geloggt.
  const playTokenRef = useRef(0);

  // Aktuelle playbackRate (Radio Sync v2 / PLL). Bewusst als Ref statt State —
  // der 1s-Regelkreis darf NICHT pro Tick einen Re-Render auslösen.
  const playbackRateRef = useRef(1);

  // Audio-Element erstellen (einmalig)
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = 0.7;
      applyPreservesPitch(audioRef.current);
    }

    const audio = audioRef.current;

    // === Event Listeners (migriert von MP3Player) ===

    // timeupdate -> updateProgress()
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    // loadedmetadata -> updateDuration()
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    // ended -> handleSongEnd()
    const handleEnded = () => {
      setIsPlaying(false);
      onTrackEnd?.();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    // Cleanup (wichtig: Blob-URLs freigeben)
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onTrackEnd]);

  // === Aktionen (migriert von MP3Player-Methoden) ===

  /**
   * Spielt einen Track ab.
   * Migriert von: MP3Player.playSong(index)
   */
  const play = useCallback((track: PlayerTrack) => {
    const audio = audioRef.current;
    if (!audio) return;

    const token = ++playTokenRef.current;
    audio.src = track.url;
    // Frischer Track startet immer mit Normaltempo; preservesPitch nach src-Wechsel
    // neu setzen (manche Browser resetten es).
    audio.playbackRate = 1;
    playbackRateRef.current = 1;
    applyPreservesPitch(audio);
    audio.play().then(() => {
      if (token === playTokenRef.current) setIsPlaying(true);
    }).catch((err: unknown) => {
      // AbortError = play() wurde von einem neuen load()/Track-Wechsel überholt
      // (bei schnellem Radio-Sync / Channel-Wechsel erwartbar) — nicht als Fehler loggen.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Fehler beim Abspielen:', err);
    });

    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  /**
   * Pausiert den aktuellen Track.
   */
  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setIsPlaying(false);
  }, []);

  /**
   * Setzt die Wiedergabe fort.
   */
  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    const token = ++playTokenRef.current;
    audio.play().then(() => {
      if (token === playTokenRef.current) setIsPlaying(true);
    }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Fehler beim Fortsetzen:', err);
    });
  }, []);

  /**
   * Wechselt zwischen Play und Pause.
   * Migriert von: MP3Player.togglePlay()
   */
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  /**
   * Springt zu einer bestimmten Zeit.
   * Migriert von: Progress Bar Click-Handler
   */
  const seek = useCallback((timeInSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = timeInSeconds;
    setCurrentTime(timeInSeconds);
  }, []);

  /**
   * Springt zu einer Position in Prozent (0-100).
   * Migriert von: progressBar click -> percent calculation
   */
  const seekPercent = useCallback((percent: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;

    const time = (percent / 100) * audio.duration;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  /**
   * Setzt die Lautstärke (0-1).
   *
   * Synchronisiert zusätzlich `audio.muted` mit dem Volume:
   *  - vol === 0 → muted = true (Browser-Autoplay-Policy erlaubt damit play()
   *    auch ohne User-Geste — wichtig für KBK's Auto-Start ab Slot-Beginn)
   *  - vol > 0   → muted = false
   *
   * Migriert von: Volume Slider input event
   */
  const setVolume = useCallback((vol: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const clampedVol = Math.max(0, Math.min(1, vol));
    audio.volume = clampedVol;
    audio.muted = clampedVol === 0;
    setVolumeState(clampedVol);
  }, []);

  /**
   * Setzt das Wiedergabe-Tempo (Radio Sync v2 / PLL-Beatmatch).
   * Geklemmt auf einen sicheren Bereich; setzt direkt am Element OHNE State-Update
   * (der 1s-Regelkreis ruft das häufig — keine Re-Renders auslösen).
   */
  const setPlaybackRate = useCallback((rate: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0.5, Math.min(2, Number.isFinite(rate) ? rate : 1));
    if (audio.playbackRate !== clamped) audio.playbackRate = clamped;
    playbackRateRef.current = clamped;
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    currentTrack,
    audioRef,
    play,
    pause,
    resume,
    togglePlay,
    seek,
    seekPercent,
    setVolume,
    setPlaybackRate,
  };
}
