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
  /** Mobile-Continuity (v3.1): Der Browser hat ein `play()` abgelehnt (typisch
   *  `NotAllowedError` im Hintergrund-Tab). Die Wiedergabe steht dann still und
   *  braucht eine echte User-Geste — die UI kann das als Hinweis anzeigen. */
  playbackBlocked: boolean;

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
  /**
   * Dauerstream: Titel-Angaben austauschen, OHNE das Element anzufassen.
   *
   * Im Stream-Modus läuft eine einzige endlose Quelle; der Titel wechselt darin,
   * ohne dass sich die Quelle ändert. `play()` aufzurufen würde den Strom
   * abreißen lassen — hier wird deshalb nur die Anzeige nachgeführt.
   */
  setCurrentTrackMeta: (track: PlayerTrack) => void;
  /** Mobile-Continuity (v3.1): Soll gerade Ton kommen? Das ist die ABSICHT
   *  (play/resume gerufen, kein pause), nicht der beobachtete Element-Zustand.
   *  Der Regelkreis unterscheidet damit „User hat pausiert" von „das OS hat uns
   *  die Wiedergabe weggenommen". */
  getIntendsToPlay: () => boolean;
  /** Mobile-Continuity (v3.1): Element wieder anwerfen, wenn es entgegen der
   *  Absicht steht (OS-Interruption, abgelehntes Hintergrund-`play()`).
   *  Erhöht bewusst NICHT den Play-Token — ein noch ausstehender
   *  `loadedmetadata`-Seek des laufenden Wechsels bleibt gültig. */
  ensurePlaying: () => void;
}

/** preservesPitch (+ Vendor-Prefixe) setzen: bei Tempo-Nudge bleibt die Tonhöhe
 *  gleich (Tempo-only Beatmatch). Wird bei Element-Erstellung + bei jedem play()
 *  gesetzt, da manche Browser den Wert beim src-Wechsel zurücksetzen. */
/** So viele erfolglose Anläufe in Folge gelten als „geht nicht mehr von allein"
 *  — danach wird der Zustand für den Hörer sichtbar (TAP TO RESUME). Drei
 *  Versuche sind bei 1s-Takt kurz genug, um nicht zu nerven, und lang genug,
 *  um einen einzelnen Puffer-Schluckauf nicht zu melden. */
const KICK_FAILURES_UNTIL_BLOCKED = 3;

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

  // === Mobile-Continuity (v3.1) ===
  // Absicht vs. Beobachtung: `intendsToPlayRef` sagt, ob Ton kommen SOLL.
  // Gesetzt von play()/resume(), gelöscht von pause(). Ein `pause`-Event des
  // Elements OHNE gelöschte Absicht bedeutet: uns wurde die Wiedergabe von
  // außen genommen (OS-Interruption, Audio-Fokus-Verlust, Hintergrund-Drossel).
  const intendsToPlayRef = useRef(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  /** Erfolglose Anläufe in Folge — siehe KICK_FAILURES_UNTIL_BLOCKED. */
  const kickFailuresRef = useRef(0);
  // onTrackEnd via Ref: der Callback kommt aus dem PlayerProvider als frische
  // Closure pro Render. Als Effect-Dependency würde er die Listener bei JEDEM
  // Render ab- und neu hängen — inklusive kurzer Lücke, in der ein `ended`
  // ins Leere läuft und die Radio-Übergabe still ausfällt.
  const onTrackEndRef = useRef(onTrackEnd);
  onTrackEndRef.current = onTrackEnd;

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
    //
    // (18.08.2026) Auf ganze Sekunden gerastert. Der Browser feuert
    // `timeupdate` rund viermal je Sekunde; jeder Aufruf schrieb bisher in den
    // Zustand des PlayerProviders und renderte damit **alle** zwanzig
    // angeschlossenen Komponenten neu — darunter MiniPlayer (894 Zeilen) und
    // die Kopfleiste (649 Zeilen). Gebraucht wird die Genauigkeit nirgends:
    // Angezeigt werden ganze Sekunden (`formatTime`), und der Fortschritts-
    // balken wandert bei einem fuenfminuetigen Stueck rund einen Bildpunkt je
    // Sekunde.
    //
    // Das senkt die Renderstoesse von vier auf einen je Sekunde. Die saubere
    // Loesung waere, die Abspielzeit ganz aus dem geteilten Zustand zu loesen
    // (eigener, schmaler Context nur fuer die zwei Verbraucher, die sie
    // wirklich brauchen: Fortschrittsbalken und Modus-Leiste). Das ist ein
    // Umbau an vier Dateien der Wiedergabe-Logik und gehoert in einen Schritt
    // mit lauffaehiger Testumgebung, nicht nebenbei.
    const handleTimeUpdate = () => {
      const jetzt = audio.currentTime;
      setCurrentTime((vorher) =>
        Math.floor(vorher) === Math.floor(jetzt) ? vorher : jetzt
      );
    };

    // loadedmetadata -> updateDuration()
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    // ended -> handleSongEnd()
    const handleEnded = () => {
      setIsPlaying(false);
      onTrackEndRef.current?.();
    };

    // Mobile-Continuity (v3.1): `isPlaying` folgt jetzt dem ELEMENT, nicht nur
    // unseren eigenen Aufrufen. Ohne diese beiden Listener blieb der React-State
    // auf `true` stehen, wenn das OS die Wiedergabe wegnahm — der Radio galt als
    // laufend, klang aber nicht, und niemand fühlte sich zuständig.
    const handlePlayEvent = () => {
      setIsPlaying(true);
      setPlaybackBlocked(false);
    };
    const handlePauseEvent = () => setIsPlaying(false);

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
    audio.addEventListener('play', handlePlayEvent);
    audio.addEventListener('pause', handlePauseEvent);

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
      audio.removeEventListener('play', handlePlayEvent);
      audio.removeEventListener('pause', handlePauseEvent);
    };
    // Bewusst leer: die Listener hängen an einem stabilen Element und lesen
    // veränderliche Callbacks über Refs (siehe onTrackEndRef).
  }, []);

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
    intendsToPlayRef.current = true;
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
      if (token === playTokenRef.current) {
        setIsPlaying(true);
        setPlaybackBlocked(false);
      }
    }).catch((err: unknown) => {
      // AbortError = play() wurde von einem neuen load()/Track-Wechsel überholt
      // (bei schnellem Radio-Sync / Channel-Wechsel erwartbar) — nicht als Fehler loggen.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Mobile-Continuity (v3.1): Chrome lehnt `play()` nach einem src-Wechsel im
      // Hintergrund-Tab mit NotAllowedError ab. Das ist der Moment, in dem der
      // Radio früher still starb — jetzt markiert und vom Regelkreis erneut
      // versucht (bzw. per Lockscreen-Play durch den Hörer erlösbar).
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setPlaybackBlocked(true);
        return;
      }
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

    intendsToPlayRef.current = false;
    setPlaybackBlocked(false);
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
    intendsToPlayRef.current = true;
    audio.play().then(() => {
      if (token === playTokenRef.current) {
        setIsPlaying(true);
        setPlaybackBlocked(false);
      }
    }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setPlaybackBlocked(true);
        return;
      }
      console.error('Fehler beim Fortsetzen:', err);
    });
  }, []);

  /**
   * Mobile-Continuity (v3.1): Element wieder anwerfen, wenn es entgegen der
   * Absicht still steht. Bewusst OHNE Play-Token-Inkrement — ein noch
   * ausstehender `loadedmetadata`-Seek des laufenden Track-Wechsels würde sonst
   * verworfen und der Track liefe ab Sekunde 0 statt an der Live-Position.
   */
  const ensurePlaying = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (!intendsToPlayRef.current) return;
    // Ein durchgelaufener Track wird NICHT wieder angeworfen. `play()` auf einem
    // beendeten Element springt laut Spezifikation zwingend auf Position 0 —
    // der fertige Titel liefe hörbar neu an, der Regelkreis würde ihn ans Ende
    // seeken, und das Ganze begänne von vorn. Das Element weiß selbst am besten,
    // dass es fertig ist; die Server-Zeitlinie taugt dafür nicht, weil DB-Dauer
    // und echte MP3-Länge auseinanderlaufen (VBR) und der Tempo-Nudge das Ende
    // zusätzlich verschiebt. Am Track-Ende ist der Wechsel zuständig, nicht der Anlauf.
    if (audio.ended) return;
    if (!audio.paused) return;

    audio.play().then(() => {
      kickFailuresRef.current = 0;
      setIsPlaying(true);
      setPlaybackBlocked(false);
    }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Ein abgelehntes `play()` ist sofort eine Sache für den Hörer.
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setPlaybackBlocked(true);
        return;
      }
      // Alles andere (kaputte Quelle, verworfener Blob, Netzabbruch) scheiterte
      // bisher lautlos: der Regelkreis versuchte es im Sekundentakt weiter, der
      // Hörer sah nichts und hörte nichts. Nach ein paar Fehlversuchen ist das
      // kein Schluckauf mehr, sondern ein Zustand — und der gehört sichtbar.
      kickFailuresRef.current += 1;
      if (kickFailuresRef.current >= KICK_FAILURES_UNTIL_BLOCKED) {
        setPlaybackBlocked(true);
      }
    });
  }, []);

  const getIntendsToPlay = useCallback(() => intendsToPlayRef.current, []);

  const setCurrentTrackMeta = useCallback((track: PlayerTrack) => {
    setCurrentTrack((prev) => (prev && prev.id === track.id ? prev : track));
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
    playbackBlocked,
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
    setCurrentTrackMeta,
    getIntendsToPlay,
    ensurePlaying,
  };
}
