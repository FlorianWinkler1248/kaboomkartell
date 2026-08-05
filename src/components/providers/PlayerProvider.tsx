'use client';

/**
 * PlayerProvider - Globaler Audio-State
 *
 * Wickelt die gesamte App und stellt den Audio-Player-State bereit.
 * Dadurch spielt Musik weiter, wenn zwischen Seiten navigiert wird.
 *
 * Stellt bereit:
 * - Audio-Player (play, pause, seek, volume, etc.)
 * - Playlist-Management (tracks, shuffle, repeat, etc.)
 * - Convenience-Methoden (playTrackAtIndex, handleNext, handlePrev)
 * - Keyboard-Shortcuts (Space, Pfeiltasten, N/P/S/R/M)
 * - MediaSession API (OS-Media-Controls, Lockscreen)
 */

import { createContext, useContext, useCallback, useRef, useMemo, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useAudioPlayer, type UseAudioPlayerReturn } from '@/hooks/useAudioPlayer';
import { usePlaylist, type UsePlaylistReturn } from '@/hooks/usePlaylist';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useRadioSync } from '@/hooks/useRadioSync';
import { useAudioAnalyser, type UseAudioAnalyserReturn } from '@/hooks/useAudioAnalyser';
import { VOTING_CONFIG } from '@/lib/constants';
import type { SyncStatus } from '@/lib/radio-sync-control';
import type { PlayerTrack } from '@/types';

/**
 * Wiedergabe-Modus (05.08.2026). KBK hat zwei getrennte Wiedergabe-Welten, und
 * die untere Leiste zeigt immer genau eine davon:
 *
 *  - `radio`  — die Hausparty. Zwei Channel, kein Transport, nicht pausierbar.
 *  - `player` — der klassische MP3-Player über eine eigene Warteschlange.
 *
 * Der Modus wird ABGELEITET statt separat gehalten: es gibt nur ein
 * `<audio>`-Element, also kann immer nur eine Welt klingen. Ein zweiter,
 * unabhängiger State könnte auseinanderlaufen und die Leiste etwas anderes
 * anzeigen lassen, als tatsächlich läuft.
 */
export type PlaybackMode = 'radio' | 'player';

interface PlayerContextType {
  audio: UseAudioPlayerReturn;
  playlist: UsePlaylistReturn;
  /** Welche Wiedergabe-Welt läuft gerade — steuert das Gesicht der Leiste. */
  playbackMode: PlaybackMode;
  /** Aus dem Player zurück in die Hausparty (stellt auch den Channel gerade). */
  returnToRadio: () => Promise<void>;
  /** Liegt eine Warteschlange bereit, in die man zurückkehren kann? */
  hasQueue: boolean;
  /** Titel aus der Warteschlange nehmen — inklusive Umzug der Wiedergabe,
   *  falls es der gerade laufende war. */
  removeFromQueue: (trackId: string) => void;
  // Convenience-Methoden
  playTrackAtIndex: (index: number) => void;
  /** ADR-041: Playlist ERSETZEN + sofort ab Index spielen (kein Stale-Read). */
  playTracks: (tracks: PlayerTrack[], index?: number) => void;
  handleTogglePlay: () => void;
  handleNext: () => void;
  handlePrev: () => void;
  activeSoundcloudTrack: PlayerTrack | null;
  // Hörzeit-Tracking & Voting
  listenedSeconds: number;
  showVotingDialog: boolean;
  dismissVotingDialog: () => void;
  onVoteSubmitted: () => void;
  // Radio-Modus
  radioMode: boolean;
  radioSlot: { id: string; label: string; type: 'weekly' | 'event' } | null;
  radioNextTrack: PlayerTrack | null;
  radioLoading: boolean;
  isLiveEvent: boolean;
  liveStreamUrl: string | null;
  /** Agency-Loop (18.06.2026, ADR-033): Herkunft des laufenden Radio-Tracks (VOTE|RANDOM|SEED). */
  radioCurrentSource: 'VOTE' | 'RANDOM' | 'SEED' | null;
  /** Agency-Loop: Crowd-Control-Fenster-ID des laufenden Tracks (für client-seitigen N+2-Pick-Match). */
  radioCurrentDecisionSeq: number | null;
  /** Radio Sync v2: Beatmatch-Status für den Player-Indikator. */
  syncStatus: SyncStatus;
  /** Radio Sync v2: clock-offset-korrigierte Server-Zeit (ms) für Countdown-UIs. */
  getServerNow: () => number;
  enterRadioMode: () => Promise<void>;
  exitRadioMode: () => void;
  // Channel-Auswahl (Phonk/Hardtek/Raggatek). Persistiert in localStorage.
  selectedChannel: string;
  setSelectedChannel: (c: string) => void;
  /** Welche Channels senden gerade — für Pulse-Animation der Tabs. */
  activeChannels: string[];
  // Audio-Analyser (Echtzeit-Frequenzdaten für Visualizer)
  analyser: UseAudioAnalyserReturn;
}

const VOLUME_STORAGE_KEY = 'kbk_volume';
const CHANNEL_STORAGE_KEY = 'kbk_channel';
const DEFAULT_CHANNEL = 'phonk';
/** Die einzigen echten Sender. Alles andere gehört nicht in die Channel-Auswahl. */
const RADIO_CHANNELS: readonly string[] = ['phonk', 'hardtek'];
const QUEUE_STORAGE_KEY = 'kbk_queue';
/** Deckel gegen aufgeblähten localStorage — 200 Titel sind mehr als jede
 *  realistische Warteschlange und bleiben weit unter dem 5-MB-Limit. */
const QUEUE_STORAGE_MAX = 200;

const PlayerContext = createContext<PlayerContextType | null>(null);

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
}

export default function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const playlist = usePlaylist();
  // Refs für onTrackEnd-Callback (damit aktuelle Werte im Closure verfügbar sind)
  const radioModeRef = useRef(false);
  const radioHandleEndedRef = useRef<(() => void) | null>(null);
  const audio = useAudioPlayer({
    onTrackEnd: () => {
      // Radio Sync v2: Der PLL-Regelkreis (useRadioSync) besitzt ALLE Track-
      // Übergänge. Hier am echten Audio-Ende nur gapless anstoßen — kein eigenes
      // play() mehr (das kollidierte mit der schedule-getriebenen Übergabe).
      if (radioModeRef.current) {
        radioHandleEndedRef.current?.();
        return;
      }
      const nextIndex = playlist.getNextIndex();
      if (nextIndex !== null) {
        const track = playlist.tracks[nextIndex];
        if (track) {
          playlist.setCurrentIndex(nextIndex);
          playlist.markAsPlayed(track.id);
          audio.play(track);
        }
      }
    },
  });

  // === Audio-Analyser (Echtzeit-Frequenzdaten) ===
  const analyser = useAudioAnalyser();

  // === Channel-Auswahl ===
  // Default 'phonk' bei brandneuen Besuchern. Wert wird beim ersten Render
  // synchron aus localStorage geladen, damit kein Render-Flash entsteht.
  const [selectedChannel, setSelectedChannelState] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_CHANNEL;
    const stored = window.localStorage.getItem(CHANNEL_STORAGE_KEY);
    // Whitelist statt Blacklist (05.08.2026): Es gibt genau zwei Sender. Alles
    // andere im Speicher ist eine Altlast — 'mine' (der frühere persönliche
    // Channel, heute der Player-Modus), 'live' (Event-Tab), 'raggatek' aus der
    // Zeit vor der Subgenre-Logik. Ein solcher Wert würde den Radio-Boot mit
    // einem Channel füttern, den der Server gar nicht sendet.
    return RADIO_CHANNELS.includes(stored ?? '') ? (stored as string) : DEFAULT_CHANNEL;
  });

  const setSelectedChannel = useCallback((c: string) => {
    setSelectedChannelState(c);
    if (typeof window !== 'undefined' && RADIO_CHANNELS.includes(c)) {
      window.localStorage.setItem(CHANNEL_STORAGE_KEY, c);
    }
  }, []);

  // === Radio-Modus (Radio Sync v2 / „The Conductor") ===
  const radio = useRadioSync(
    audio.play,
    audio.seek,
    audio.pause,
    audio.setPlaybackRate,
    audio.currentTime,
    audio.duration,
    audio.isPlaying,
    audio.volume,
    selectedChannel,
    // Radio Sync v3 (ADR-040): Stall-Signal + Blob-Error-Registrierung.
    audio.isStalled,
    audio.setOnBlobError,
    // Mobile-Continuity (v3.1): Absicht + Wiederanwerfen, damit der Regelkreis
    // eine vom Browser/OS gestoppte Wiedergabe selbst wieder aufnimmt.
    audio.getIntendsToPlay,
    audio.ensurePlaying,
    audio.playbackBlocked,
  );

  // Radio-Refs synchronisieren (werden im onTrackEnd-Callback gelesen)
  radioModeRef.current = radio.radioMode;
  radioHandleEndedRef.current = radio.handleTrackEnded;

  // Mute-State für Keyboard-Shortcut (M-Taste)
  const prevVolumeRef = useRef(audio.volume);

  // === Initial-Setup: Volume aus localStorage + Auto-Start ===
  // Neue Besucher kommen muted rein (volume=0). Bestehende User bekommen ihren
  // gespeicherten Wert. Danach wird automatisch in den Radio-Modus gewechselt —
  // weil audio.muted=true ist, erlaubt der Browser den autoplay (Autoplay-Policy).
  // Wenn aktuell kein Slot läuft, wartet der Polling-Loop von useRadioSync und
  // springt sofort an, sobald ein Slot startet (z.B. 20:00 Phonk-Set).
  const didBootRef = useRef(false);
  useEffect(() => {
    if (didBootRef.current) return;
    if (typeof window === 'undefined') return;
    didBootRef.current = true;

    const stored = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    const initialVol = stored !== null ? Math.max(0, Math.min(1, parseFloat(stored))) : 0;
    audio.setVolume(Number.isFinite(initialVol) ? initialVol : 0);

    // Auto-Enter Radio-Modus. Analyser wird hier NICHT initialisiert — das
    // braucht eine User-Geste (AudioContext-Restriction) und passiert lazy
    // beim ersten Volume-Up.
    radio.enterRadioMode().catch((err) => {
      console.error('Auto-Start Radio fehlgeschlagen:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === Warteschlangen-Persistenz (05.08.2026) ===
  // Ohne sie wäre nach jedem Reload die eigene Auswahl weg und „ZURÜCK ZUM
  // PLAYER" führte ins Leere. Bewusst NUR die Warteschlange, keine Wiedergabe:
  // die Seite bootet weiterhin ins (stumme) Radio, der Hörer entscheidet.
  const didRestoreQueueRef = useRef(false);
  // Der Wiederherstell-Effekt setzt State, der erst im NÄCHSTEN Durchgang
  // sichtbar wird — der Speicher-Effekt läuft aber schon in diesem, sieht eine
  // leere Liste und hätte den Eintrag gelöscht. Diese Marke lässt ihn genau
  // einen Durchgang aussetzen.
  const restorePendingRef = useRef(false);
  useEffect(() => {
    if (didRestoreQueueRef.current) return;
    if (typeof window === 'undefined') return;
    didRestoreQueueRef.current = true;
    try {
      const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as {
        tracks?: PlayerTrack[];
        currentIndex?: number;
        shuffleEnabled?: boolean;
        repeatMode?: 'off' | 'all' | 'one';
      };
      if (!Array.isArray(stored.tracks) || stored.tracks.length === 0) return;
      restorePendingRef.current = true;
      playlist.restoreQueue({
        tracks: stored.tracks.slice(0, QUEUE_STORAGE_MAX),
        currentIndex: stored.currentIndex ?? 0,
        shuffleEnabled: stored.shuffleEnabled ?? false,
        repeatMode: stored.repeatMode ?? 'off',
      });
    } catch {
      // Kaputter Eintrag (Format-Wechsel, manuell editiert) — verwerfen statt
      // den Player-Start daran scheitern zu lassen.
      window.localStorage.removeItem(QUEUE_STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!didRestoreQueueRef.current) return;
    if (restorePendingRef.current) {
      // Die wiederhergestellte Liste ist noch unterwegs — diesen Durchgang
      // auslassen, statt den Eintrag versehentlich zu löschen.
      restorePendingRef.current = false;
      return;
    }
    try {
      // Lokal per Drag & Drop hinzugefügte Dateien fliegen raus: ihre
      // `blob:`-Adresse ist nach einem Reload ungültig, der Titel stünde als
      // stummer Eintrag in der Warteschlange.
      const persistable = playlist.tracks.filter((t) => !t.isLocal).slice(0, QUEUE_STORAGE_MAX);
      if (persistable.length === 0) {
        window.localStorage.removeItem(QUEUE_STORAGE_KEY);
        return;
      }
      // Der Zeiger muss auf denselben Titel zeigen wie vor dem Filtern —
      // sonst landet der Hörer nach dem Reload bei einem anderen Stück.
      const currentTrackId = playlist.tracks[playlist.currentIndex]?.id;
      const currentIndex = Math.max(0, persistable.findIndex((t) => t.id === currentTrackId));
      window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify({
        tracks: persistable,
        currentIndex,
        shuffleEnabled: playlist.shuffleEnabled,
        repeatMode: playlist.repeatMode,
      }));
    } catch {
      // Speicher voll oder gesperrt (Privat-Modus) — kein Grund, irgendetwas
      // abzubrechen; die Warteschlange lebt dann nur für diese Sitzung.
    }
  }, [playlist.tracks, playlist.currentIndex, playlist.shuffleEnabled, playlist.repeatMode]);

  // Volume-Persistenz: jede Änderung in localStorage speichern (debounce-frei,
  // setItem ist billig). Beim nächsten Reload bleibt der Wert erhalten — auch
  // 0, damit "muted bleiben" eine echte User-Entscheidung sein kann.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!didBootRef.current) return; // initial-set durch Boot-Effekt nicht überschreiben
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(audio.volume));
  }, [audio.volume]);

  // v2.26: AudioContext-Wake bei jeder User-Volume-Änderung > 0.
  // Ohne diesen Hook bleibt der AudioContext nach Auto-Boot (muted=true) im
  // suspended-State, und der Equalizer zeigt nur die Default-Welle obwohl
  // ein Track läuft. initAnalyser ist idempotent — bei zweitem Call wird
  // nur AudioContext.resume() ausgelöst. Volume-Slider-Move ist eine
  // gueltige User-Geste für die Browser-AudioContext-Policy.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!audio.audioRef.current) return;
    if (audio.volume <= 0) return;
    analyser.initAnalyser(audio.audioRef.current);
  }, [audio.volume, audio.audioRef, analyser]);

  // v2.26: AudioContext-Wake bei jedem Track-ID-Wechsel im Radio-Modus.
  // useRadioSync.syncToTrack ruft audioPlay() ohne Analyser-Init — wenn der
  // Slot wechselt, kommt der EQ nie an die neuen Frequenzdaten. Der Effect
  // hier deckt alle Track-Wechsel-Pfade ab (Direct-Play, Slot-Switch,
  // onTrackEnd → next-track), idempotent.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!audio.audioRef.current) return;
    if (!audio.currentTrack?.id) return;
    analyser.initAnalyser(audio.audioRef.current);
  }, [audio.currentTrack?.id, audio.audioRef, analyser]);

  // Play-Count Debounce (same track within 30s won't count again)
  const lastPlayRef = useRef<{ trackId: string; time: number } | null>(null);

  // Aktueller SoundCloud-Track (falls einer aktiv ist)
  const activeSoundcloudTrack = useMemo(() => {
    const current = playlist.tracks[playlist.currentIndex];
    return current?.isSoundcloud ? current : null;
  }, [playlist.tracks, playlist.currentIndex]);

  // === Hörzeit-Tracking für Voting-System ===

  // Ref zählt jede Sekunde mit, State wird nur alle 5s aktualisiert (weniger Re-Renders)
  const listenedSecondsRef = useRef(0);
  const [listenedSeconds, setListenedSeconds] = useState(0);
  const [showVotingDialog, setShowVotingDialog] = useState(false);
  // Bereits bewertete Tracks merken (verhindert erneutes Anzeigen)
  const [votedTrackIds, setVotedTrackIds] = useState<Set<string>>(new Set());

  // Bei Track-Wechsel: Hörzeit zurücksetzen
  useEffect(() => {
    listenedSecondsRef.current = 0;
    setListenedSeconds(0);
    setShowVotingDialog(false);
  }, [playlist.currentIndex]);

  // Jede Sekunde mitzählen wenn Track spielt
  useEffect(() => {
    const interval = setInterval(() => {
      if (audio.isPlaying) {
        listenedSecondsRef.current += 1;

        // State nur alle 5 Sekunden aktualisieren (Performance)
        if (listenedSecondsRef.current % 5 === 0) {
          setListenedSeconds(listenedSecondsRef.current);
        }

        // Voting-Dialog nach Mindesthörzeit einblenden
        const currentTrack = playlist.tracks[playlist.currentIndex];
        if (
          listenedSecondsRef.current >= VOTING_CONFIG.minListenSeconds &&
          session?.user &&
          currentTrack &&
          !currentTrack.isLocal &&
          !votedTrackIds.has(currentTrack.id) &&
          !showVotingDialog
        ) {
          setShowVotingDialog(true);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [audio.isPlaying, playlist.tracks, playlist.currentIndex, session, votedTrackIds, showVotingDialog]);

  // Voting-Dialog schließen (ohne abzustimmen)
  const dismissVotingDialog = useCallback(() => {
    setShowVotingDialog(false);
    const currentTrack = playlist.tracks[playlist.currentIndex];
    if (currentTrack) {
      // Track als "gesehen" merken, damit Dialog nicht erneut erscheint
      setVotedTrackIds((prev) => new Set(prev).add(currentTrack.id));
    }
  }, [playlist.tracks, playlist.currentIndex]);

  // Nach erfolgreicher Abstimmung
  const onVoteSubmitted = useCallback(() => {
    setShowVotingDialog(false);
    const currentTrack = playlist.tracks[playlist.currentIndex];
    if (currentTrack) {
      setVotedTrackIds((prev) => new Set(prev).add(currentTrack.id));
    }
  }, [playlist.tracks, playlist.currentIndex]);

  // Track abspielen per Index
  const playTrackAtIndex = useCallback(
    (index: number) => {
      const track = playlist.tracks[index];
      if (!track) return;

      // Wenn der User explizit einen Track wählt (z.B. von der Track-Detail-Page),
      // muss der Radio-Modus exiten — sonst überschreibt der Sync-Loop innerhalb
      // von 30s den User-Track wieder mit dem Radio-Track. Bei Off-Air ruft der
      // Sync-Loop zusätzlich audioPause() und stoppt den Track komplett.
      // User kann via Channel-Tab im MiniPlayer wieder ins Radio.
      if (radio.radioMode) {
        radio.exitRadioMode();
      }

      playlist.setCurrentIndex(index);
      playlist.markAsPlayed(track.id);

      // Increment play count (fire-and-forget, debounced 30s)
      if (!track.isLocal) {
        const now = Date.now();
        const last = lastPlayRef.current;
        if (!last || last.trackId !== track.id || (now - last.time) > 30000) {
          lastPlayRef.current = { trackId: track.id, time: now };
          fetch(`/api/tracks/${track.id}/play`, { method: 'POST' }).catch(() => {});
        }
      }

      if (track.isSoundcloud) {
        // SoundCloud-Tracks: HTML5 Audio stoppen, Embed übernimmt
        audio.pause();
      } else {
        audio.play(track);
        // v2.14: AudioContext für Equalizer initialisieren (Direct-Play-Pfad).
        // initAnalyser ist idempotent + resumed bei zweitem Call den AudioContext.
        // Klick auf Play Track ist eine User-Geste — Browser erlaubt AudioContext-Init.
        if (audio.audioRef.current) {
          analyser.initAnalyser(audio.audioRef.current);
        }
      }
    },
    [playlist, audio, radio, analyser]
  );

  // ADR-041: Playlist ersetzen + sofort abspielen — ohne Stale-Closure-Falle.
  // setTracks + playTrackAtIndex im selben Tick liest sonst das ALTE
  // playlist.tracks (State-Update ist async), returnt früh und lässt den
  // Radio-Modus weiterlaufen, obwohl die UI schon umgeschaltet hat. Hier
  // kommt der Track als Argument — kein Read aus dem State nötig.
  const playTracks = useCallback(
    (tracks: PlayerTrack[], index: number = 0) => {
      const track = tracks[index];
      if (!track) return;

      if (radio.radioMode) {
        radio.exitRadioMode();
      }

      playlist.setTracks(tracks);
      playlist.setCurrentIndex(index);
      playlist.markAsPlayed(track.id);

      // Increment play count (fire-and-forget, debounced 30s — wie playTrackAtIndex)
      if (!track.isLocal) {
        const now = Date.now();
        const last = lastPlayRef.current;
        if (!last || last.trackId !== track.id || (now - last.time) > 30000) {
          lastPlayRef.current = { trackId: track.id, time: now };
          fetch(`/api/tracks/${track.id}/play`, { method: 'POST' }).catch(() => {});
        }
      }

      if (track.isSoundcloud) {
        audio.pause();
      } else {
        audio.play(track);
        if (audio.audioRef.current) {
          analyser.initAnalyser(audio.audioRef.current);
        }
      }
    },
    [playlist, audio, radio, analyser]
  );

  // Toggle Play/Pause
  const handleTogglePlay = useCallback(() => {
    if (!audio.currentTrack && playlist.tracks.length > 0) {
      playTrackAtIndex(0);
    } else {
      audio.togglePlay();
    }
  }, [audio, playlist.tracks.length, playTrackAtIndex]);

  // Next
  const handleNext = useCallback(() => {
    const nextIndex = playlist.getNextIndex();
    if (nextIndex !== null) {
      playTrackAtIndex(nextIndex);
    }
  }, [playlist, playTrackAtIndex]);

  // Prev
  const handlePrev = useCallback(() => {
    if (audio.currentTime > 3) {
      audio.seek(0);
      return;
    }
    const prevIndex = playlist.getPrevIndex();
    if (prevIndex !== null) {
      playTrackAtIndex(prevIndex);
    }
  }, [audio, playlist, playTrackAtIndex]);

  // === Wiedergabe-Modus ===
  // Der Player zeigt sich nur, wenn es wirklich etwas Eigenes zu bedienen gibt:
  // Radio aus UND eine Warteschlange UND ein geladener Titel.
  //
  // Alle drei Bedingungen sind nötig:
  //  - Das Radio zu verlassen ist nicht dasselbe wie den Player zu benutzen.
  //    Ein SoundCloud-Embed etwa steigt nur aus dem Radio aus und pausiert.
  //    Ohne die Warteschlangen-Bedingung zeigte die Player-Leiste dann den
  //    zuletzt gelaufenen RADIO-Titel samt Fortschrittsbalken — und ein Druck
  //    auf Play hätte ihn über das laufende Embed gelegt.
  //  - `currentTrack` fängt den Seiten-Start ab: eine wiederhergestellte
  //    Warteschlange existiert schon, bevor der Radio-Boot durch ist — sonst
  //    blitzte die Player-Leiste kurz auf.
  const hasQueue = playlist.tracks.length > 0;
  const playbackMode: PlaybackMode =
    !radio.radioMode && hasQueue && audio.currentTrack ? 'player' : 'radio';

  // Titel aus der Warteschlange nehmen. Trifft es den laufenden Titel, zieht die
  // Wiedergabe sofort auf den Nachfolger um — sonst spielte das entfernte Stück
  // zu Ende und die Warteschlangen-Anzeige widerspräche dem, was zu hören ist.
  const removeFromQueue = useCallback((trackId: string) => {
    const { removedWasCurrent, nowPlaying } = playlist.removeTrack(trackId);
    if (!removedWasCurrent) return;
    if (nowPlaying) {
      playlist.markAsPlayed(nowPlaying.id);
      audio.play(nowPlaying);
    } else {
      // Letzter Titel raus — nichts mehr zu spielen.
      audio.pause();
    }
  }, [playlist, audio]);

  // Zurück in die Hausparty. Der Channel wird dabei geradegestellt: der
  // Sync-Loop darf nie einen Nicht-Radio-Channel pollen.
  const returnToRadio = useCallback(async () => {
    if (!RADIO_CHANNELS.includes(selectedChannel)) {
      setSelectedChannel(DEFAULT_CHANNEL);
    }
    if (!analyser.isReady && audio.audioRef.current) {
      analyser.initAnalyser(audio.audioRef.current);
    }
    await radio.enterRadioMode();
  }, [selectedChannel, setSelectedChannel, analyser, audio.audioRef, radio]);

  // === Keyboard-Shortcuts ===
  // Leertaste ist modus-abhängig: im Player pausiert sie, im Radio wirft sie die
  // Wiedergabe nur wieder an (nie anhalten — Hausparty). Damit bleibt im Radio
  // eine Rettung am Gerät, wenn der Ton weg ist, ohne das Konzept aufzuweichen.
  useKeyboardShortcuts({
    togglePlay: playbackMode === 'player' ? handleTogglePlay : audio.ensurePlaying,
    seekForward: () => audio.seek(Math.min(audio.currentTime + 5, audio.duration)),
    seekBackward: () => audio.seek(Math.max(audio.currentTime - 5, 0)),
    volumeUp: () => audio.setVolume(Math.min(audio.volume + 0.05, 1)),
    volumeDown: () => audio.setVolume(Math.max(audio.volume - 0.05, 0)),
    nextTrack: handleNext,
    prevTrack: handlePrev,
    toggleShuffle: playlist.toggleShuffle,
    cycleRepeat: playlist.cycleRepeatMode,
    toggleMute: () => {
      if (audio.volume > 0) {
        prevVolumeRef.current = audio.volume;
        audio.setVolume(0);
      } else {
        audio.setVolume(prevVolumeRef.current || 0.7);
      }
    },
  }, { transportEnabled: playbackMode === 'player' });

  // === MediaSession API ===
  // Im Radio-Modus bekommt das OS bewusst nur Play/Pause: Weiter/Zurück auf dem
  // Sperrbildschirm würde eine Hausparty suggerieren, die man durchskippen kann.
  useMediaSession(
    {
      currentTrack: audio.currentTrack,
      isPlaying: audio.isPlaying,
      currentTime: audio.currentTime,
      duration: audio.duration,
    },
    {
      onPlay: () => audio.resume(),
      onPause: () => audio.pause(),
      onNext: handleNext,
      onPrev: handlePrev,
      onSeek: (time) => audio.seek(time),
    },
    { transportEnabled: playbackMode === 'player' }
  );

  return (
    <PlayerContext.Provider
      value={{
        audio,
        playlist,
        playbackMode,
        returnToRadio,
        hasQueue,
        removeFromQueue,
        playTrackAtIndex,
        playTracks,
        handleTogglePlay,
        handleNext,
        handlePrev,
        activeSoundcloudTrack,
        listenedSeconds,
        showVotingDialog,
        dismissVotingDialog,
        onVoteSubmitted,
        // Radio-Modus
        radioMode: radio.radioMode,
        radioSlot: radio.radioSlot,
        radioNextTrack: radio.radioNextTrack,
        radioLoading: radio.radioLoading,
        isLiveEvent: radio.isLiveEvent,
        liveStreamUrl: radio.liveStreamUrl,
        radioCurrentSource: radio.radioCurrentSource,
        radioCurrentDecisionSeq: radio.radioCurrentDecisionSeq,
        syncStatus: radio.syncStatus,
        getServerNow: radio.getServerNow,
        enterRadioMode: async () => {
          // Analyser beim ersten User-Geste-Click initialisieren
          if (!analyser.isReady && audio.audioRef.current) {
            analyser.initAnalyser(audio.audioRef.current);
          }
          await radio.enterRadioMode();
        },
        exitRadioMode: radio.exitRadioMode,
        // Channel-Steuerung
        selectedChannel,
        setSelectedChannel,
        activeChannels: radio.activeChannels,
        // Audio-Analyser
        analyser,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}
