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
  /** Radio Sync v3 (ADR-040): Element meldet Puffer-Stall (waiting/stalled/error);
   *  playing/canplay setzen zurück. Speist den Stall-Guard im Regelgesetz. */
  isStalled: boolean;

  // Refs
  audioRef: React.RefObject<HTMLAudioElement | null>;

  // Actions
  /** Radio Sync v3: optionales `getStartSec` seekt event-getrieben beim
   *  `loadedmetadata` auf einen FRISCH berechneten Wert (ersetzt Blind-Seeks). */
  play: (track: PlayerTrack, getStartSec?: () => number) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seek: (timeInSeconds: number) => void;
  seekPercent: (percent: number) => void;
  setVolume: (volume: number) => void;
  /** Radio Sync v2: Tempo-Nudge für den PLL-Beatmatch. Setzt audio.playbackRate
   *  direkt am Element (kein Re-Render). preservesPitch hält die Tonhöhe. */
  setPlaybackRate: (rate: number) => void;
  /** Radio Sync v3: Callback für `error` bei blob:-Quelle registrieren
   *  (useRadioSync macht daraus die Netz-URL-Recovery). */
  setOnBlobError: (cb: (() => void) | null) => void;
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
  // Radio Sync v3 (ADR-040): Stall-Zustand des Elements (waiting/stalled/error).
  const [isStalled, setIsStalled] = useState(false);
  // Callback für Blob-Playback-Fehler (Registrierung via setOnBlobError).
  const onBlobErrorRef = useRef<(() => void) | null>(null);

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

    // Radio Sync v3 (ADR-040): Stall-Erkennung. waiting/stalled = Puffer leer,
    // playing/canplay = wieder Daten da. `error` zählt ebenfalls als Stall; bei
    // blob:-Quelle zusätzlich den Recovery-Callback rufen (Netz-URL-Replay).
    const handleStall = () => setIsStalled(true);
    const handleUnstall = () => setIsStalled(false);
    const handleError = () => {
      setIsStalled(true);
      if (audio.src.startsWith('blob:')) onBlobErrorRef.current?.();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('waiting', handleStall);
    audio.addEventListener('stalled', handleStall);
    audio.addEventListener('error', handleError);
    audio.addEventListener('playing', handleUnstall);
    audio.addEventListener('canplay', handleUnstall);

    // Cleanup (wichtig: Blob-URLs freigeben)
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('waiting', handleStall);
      audio.removeEventListener('stalled', handleStall);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('playing', handleUnstall);
      audio.removeEventListener('canplay', handleUnstall);
    };
  }, [onTrackEnd]);

  // === Aktionen (migriert von MP3Player-Methoden) ===

  /**
   * Spielt einen Track ab.
   * Migriert von: MP3Player.playSong(index)
   *
   * Radio Sync v3 (ADR-040): optionales `getStartSec` registriert einen One-Shot-
   * `loadedmetadata`-Listener, der die Start-Position im Event-Moment FRISCH
   * berechnet (ersetzt die alten 300ms-Blind-Seeks — auf langsamem Netz kamen die
   * Metadaten später und der Seek landete daneben).
   */
  const play = useCallback((track: PlayerTrack, getStartSec?: () => number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const token = ++playTokenRef.current;
    audio.src = track.url;
    setIsStalled(false);
    // Frischer Track startet immer mit Normaltempo; preservesPitch nach src-Wechsel
    // neu setzen (manche Browser resetten es).
    audio.playbackRate = 1;
    playbackRateRef.current = 1;
    applyPreservesPitch(audio);
    if (getStartSec) {
      const onMeta = () => {
        // Von einem neueren play() überholt → Seek gehört nicht mehr uns.
        if (token !== playTokenRef.current) return;
        const target = getStartSec();
        if (!Number.isFinite(target) || target <= 0) return;
        const clamped = audio.duration > 0 ? Math.min(target, audio.duration) : target;
        audio.currentTime = clamped;
        setCurrentTime(clamped);
      };
      audio.addEventListener('loadedmetadata', onMeta, { once: true });
    }
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

  /**
   * Radio Sync v3: Blob-Error-Callback registrieren (null = abmelden).
   */
  const setOnBlobError = useCallback((cb: (() => void) | null) => {
    onBlobErrorRef.current = cb;
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    currentTrack,
    isStalled,
    audioRef,
    play,
    pause,
    resume,
    togglePlay,
    seek,
    seekPercent,
    setVolume,
    setPlaybackRate,
    setOnBlobError,
  };
}
