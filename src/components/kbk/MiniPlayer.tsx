'use client';

/**
 * KBK Mini-Player — Sticky-Bottom-Bar auf allen Pages außer /admin.
 *
 * Konzept (Hausparty + Channel-Modell, 26.04.2026, Tab-Update 02.05.2026):
 *  - Zwei Sender-Tabs: PHONK / HARDTEK (Raggatek raus, läuft als Subgenre
 *    im Hardtek-Channel).
 *  - User wählt aktiven Sender per Tab-Klick (persistiert in localStorage)
 *  - Wenn der gewählte Channel gerade nicht sendet → Stille, "OFF AIR"-Anzeige
 *  - Pulse-Animation auf den Tabs deren Channel JETZT live ist
 *  - Auto-Start: Player läuft beim Page-Load automatisch (muted, Browser-erlaubt),
 *    bei Slot-Beginn (z.B. 20:00) springt er sofort an. User unmutet via Slider.
 *  - Equalizer-Hintergrund: Vollbild-Visualisierung im Hintergrund der Bar
 *    (PlayerBackgroundEqualizer), Buttons + Labels haben relative z-10.
 *  - AI-Tag-Pill: Boomy-Purple-Badge oben rechts wenn aktueller Track ein
 *    AI-Tag traegt (Stub bis Subagent-A-Schema live ist).
 *
 * Layout (links nach rechts):
 *  [Logo] [PHONK | HARDTEK] [Track-Info] [Vol-Slider] [Mute] [AURA+] [SUS]
 */

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { useMyPlaylist } from '@/components/providers/LikesProvider';
import { consumePickIfMatches } from '@/lib/agency-picks';
import type { PlayerTrack } from '@/types';
import PlayerBackgroundEqualizer from '@/components/player/PlayerBackgroundEqualizer';
import { useTrackAiTag } from '@/hooks/useTrackAiTag';
import { useChannelAccent, CHANNEL_COLORS } from '@/hooks/useChannelAccent';
import { extractTwitchChannelFromUrl } from '@/lib/twitch-url';
import Link from 'next/link';
import { obsidianFrameVars } from '@/lib/obsidian-frame';

// Channel-Tabs: Phonk + Hardtek (Raggatek raus aus Direkt-Auswahl, läuft als
// Subgenre-Override im Hardtek-Channel). Seit 08.06.2026 (ADR-028) zusätzlich
// LIVE für Twitch/YouTube-Stream-Events — dieser Tab erscheint NUR, während ein
// Live-Event läuft (activeChannels enthält dann 'live').
// Seit 24.07.2026 (ADR-041) MINE: der persönliche Channel — spielt die eigenen
// Aura+-Likes als User-Playback (KEIN Radio-Sync), dunkelgrau, immer sichtbar.
// MINE wird bewusst nicht persistiert (PlayerProvider) — Reload bootet muted
// ins Radio, weil Personal-Playback eine User-Geste braucht.
type Channel = 'phonk' | 'hardtek' | 'live' | 'mine';

const CHANNELS: ReadonlyArray<{ id: Channel; label: string; color: string }> = [
  { id: 'phonk', label: 'PHONK', color: CHANNEL_COLORS.phonk },
  { id: 'hardtek', label: 'HARDTEK', color: CHANNEL_COLORS.hardtek },
  { id: 'live', label: 'LIVE', color: CHANNEL_COLORS.live },
  { id: 'mine', label: 'MINE', color: CHANNEL_COLORS.mine },
];

// Pulse-Animation: Live-Channel-Tabs (v2.9 transform+opacity statt box-shadow).
// box-shadow loest auf Mobile teure Repaints aus, transform+opacity läuft
// auf der GPU-Compositor-Ebene → glatte 60fps. Glow als ::after-Pseudo
// mit transform statt box-shadow.
const PULSE_KEYFRAMES = `
@keyframes kbk-channel-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.92; }
}
@keyframes kbk-channel-pulse-active {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}
`;

export default function MiniPlayer() {
  const t = useTranslations('player');
  // Agency-Loop (18.06.2026): eigener Namespace fürs „dein Pick läuft"-Toast.
  const tCrowd = useTranslations('home.crowd');
  const pathname = usePathname();
  const player = usePlayer();
  const {
    audio,
    radioSlot,
    selectedChannel,
    setSelectedChannel,
    activeChannels,
    listenedSeconds,
    radioMode,
    enterRadioMode,
    analyser,
    isLiveEvent,
    liveStreamUrl,
    syncStatus,
    radioCurrentSource,
    radioCurrentDecisionSeq,
    playlist: playerPlaylist,
    playTrackAtIndex,
  } = player;
  const { toast } = useToast();
  // Aura+-Likes (ADR-041): speist den MINE-Channel + die AURA-Pill für Anonyme.
  const likes = useMyPlaylist();
  // v2.31: Wenn der aktive Slot ein Twitch-Live-Event ist, übernehmen wir die
  // Track-Info-Box mit einem prominenten LIVESTREAM-Block + Link zu /radio.
  const liveTwitchChannel = isLiveEvent ? extractTwitchChannelFromUrl(liveStreamUrl) : null;
  const { data: session } = useSession();
  const current = audio.currentTrack;
  const aiTag = useTrackAiTag();
  const channelAccent = useChannelAccent();

  // Hide im Admin- und Studio-Bereich (eigenes Layout, andere Höhen-Mechanik).
  const hide = (pathname?.startsWith('/admin') || pathname?.startsWith('/studio')) ?? false;

  // Body-Class für globalen padding-bottom-Spacer.
  useEffect(() => {
    if (hide) {
      document.body.classList.remove('kbk-has-miniplayer');
    } else {
      document.body.classList.add('kbk-has-miniplayer');
    }
    return () => {
      document.body.classList.remove('kbk-has-miniplayer');
    };
  }, [hide]);

  // Vorheriges Volume merken — Mute-Toggle stellt's wieder her.
  const prevVolumeRef = useRef(0.7);
  useEffect(() => {
    if (audio.volume > 0) prevVolumeRef.current = audio.volume;
  }, [audio.volume]);
  const isMuted = audio.volume === 0;

  // Aktiven Channel als Channel-Type ableiten (defensiv, falls localStorage Müll enthält
  // — z.B. alte 'raggatek'-Auswahl aus der Pre-02.05.2026-Welt landet auf 'phonk').
  const activeChannel: Channel = (CHANNELS.find((c) => c.id === selectedChannel)?.id ?? 'phonk') as Channel;
  // Akzentfarbe folgt dem Subgenre-Override: Hardtek-Slot mit Raggatek-Set
  // faerbt sich Raggatek-Orange. useChannelAccent liefert bereits den
  // effektiven Wert.
  const accent = channelAccent.color;
  // v2.10 02.05.: Equalizer auch bei manueller Wiedergabe aktiv (nicht nur Radio-Modus).
  const isPlayingAudible = audio.isPlaying && audio.volume > 0;

  // Falls ein User noch 'raggatek' im localStorage hat (Pre-02.05.2026):
  // einmalig auf 'phonk' korrigieren, sonst bleibt der Channel-Tab unsichtbar
  // und der Player rendert "OFF AIR — pick a channel" obwohl ein Klick reicht.
  useEffect(() => {
    if (selectedChannel !== 'phonk' && selectedChannel !== 'hardtek') {
      setSelectedChannel('phonk');
    }
    // Nur einmal beim Mount evaluieren — spätere Änderungen sind valide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LIVE-Channel (ADR-028) verschwindet, sobald kein Live-Event mehr läuft →
  // den User zurück auf phonk holen, sonst bliebe er auf einem toten Tab hängen.
  useEffect(() => {
    if (selectedChannel === 'live' && !activeChannels.includes('live')) {
      setSelectedChannel('phonk');
    }
  }, [selectedChannel, activeChannels, setSelectedChannel]);

  // Vote-State: lokale Track-ID-Map, damit nach Vote die Pills gefüllt bleiben
  // bis zum nächsten Track-Wechsel. Server kennt's persistent, Client visualisiert.
  const [voteState, setVoteState] = useState<{ trackId: string; aura: boolean; sus: boolean } | null>(null);
  useEffect(() => {
    setVoteState(null);
  }, [current?.id]);

  // Agency-Loop (18.06.2026, ADR-033): „dein Pick läuft". Bei jedem Track-Wechsel prüfen,
  // ob der jetzt laufende Track aus einem Community-Vote stammt (currentSource === 'VOTE')
  // UND ob ICH für genau dieses Fenster gevotet habe (consumePickIfMatches matcht den
  // N+2-Versatz und schützt gegen Doppel-Toast). Treffer → useToast.
  useEffect(() => {
    if (!current?.id) return;
    if (radioCurrentSource !== 'VOTE') return;
    if (
      consumePickIfMatches(selectedChannel, radioCurrentDecisionSeq, current.id)
    ) {
      toast({ type: 'success', message: tCrowd('yourPickOnAir', { track: current.title }) });
    }
    // current.title ist an current.id gekoppelt — id reicht als Wechsel-Signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, radioCurrentSource, radioCurrentDecisionSeq, selectedChannel]);

  // Radio Sync v2: Info-Modal („wie bleibt das Rudel im Takt?").
  const [showSyncInfo, setShowSyncInfo] = useState(false);

  // === Marquee-Effekt für den Track-Titel (v2.23, 02.05.2026 nacht) ===
  // Wenn der Titel breiter ist als die Track-Info-Box, scrollt er wie auf
  // alten MP3-Playern oder Auto-Radios von rechts nach links durch — mit
  // Pause am Anfang + Ende, dann snap zurück. Sonst statische Anzeige
  // mit Ellipsis (Standard-Verhalten).
  const titleWrapRef = useRef<HTMLDivElement>(null);
  const titleInnerRef = useRef<HTMLSpanElement>(null);
  const [titleOverflowPx, setTitleOverflowPx] = useState(0);
  useEffect(() => {
    const wrap = titleWrapRef.current;
    const inner = titleInnerRef.current;
    if (!wrap || !inner) return;
    const measure = () => {
      const overflow = inner.scrollWidth - wrap.clientWidth;
      // Threshold 6px: minimaler Pixel-Drift soll keine Marquee triggern
      setTitleOverflowPx(overflow > 6 ? overflow : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [current?.id, current?.title, radioSlot]);

  // Scroll-Geschwindigkeit ~ 50 px/s, plus Pause-Anteile (10% start + 10% end).
  // Ergibt für 200px Overflow ca. 5s Scroll + ~1.2s Pausen = 6.2s Loop.
  const marqueeDuration = titleOverflowPx > 0
    ? Math.max(6, Math.round(titleOverflowPx / 50) + 3)
    : 0;

  const handleMuteToggle = () => {
    if (isMuted) {
      audio.setVolume(prevVolumeRef.current || 0.7);
    } else {
      audio.setVolume(0);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = Number(e.target.value) / 100;
    audio.setVolume(newVol);
  };

  // MINE-Channel (ADR-041): nur LOCAL-Likes laufen über die eigene Audio-Pipeline
  // (Auto-Advance). SC-Likes erscheinen auf /playlists/mine als Embed-Sektion.
  const mineTracks = likes.likedTracks.filter((t2) => t2.trackType === 'LOCAL');

  const handleChannelClick = (c: Channel) => {
    if (c === 'mine') {
      if (mineTracks.length === 0) {
        // Leerer Zustand: Channel NICHT wechseln, Radio läuft weiter.
        toast({
          type: 'info',
          message: likes.isAnon ? t('mine.emptyAnonToast') : t('mine.emptyUserToast'),
        });
        return;
      }
      setSelectedChannel('mine');
      const playerTracks: PlayerTrack[] = mineTracks.map((t2) => ({
        id: t2.id,
        title: t2.title,
        artist: t2.artistLabel,
        duration: t2.duration,
        url: t2.streamUrl,
        coverUrl: t2.coverUrl ?? undefined,
        isLocal: false,
      }));
      playerPlaylist.setTracks(playerTracks);
      // exitRadioMode + Analyser-Init übernimmt playTrackAtIndex (User-Geste).
      playTrackAtIndex(0);
      return;
    }
    setSelectedChannel(c);
    // Wenn der User aus dem Single-Track-Modus kommt (z.B. nach Klick auf
    // "Play Track" auf einer Track-Detail-Page), bringen wir ihn per
    // Channel-Klick wieder ins Radio — sonst bliebe der Tab kosmetisch.
    if (!radioMode) {
      enterRadioMode().catch((err) => {
        console.error('Re-Enter Radio fehlgeschlagen:', err);
      });
    }
  };

  // Vote-Submit. Optimistic-UI: lokal sofort setzen, bei Fehler revert.
  // Mind-Listening-Time wird vom Backend geprüft (60s); UI zeigt Tooltip wenn zu früh.
  // Anonyme (ADR-041): AURA+ wird zum Session-Like (localStorage + Nudge),
  // SUS bleibt Login-only (Qualitäts-Signal braucht einen Account).
  const submitVote = async (kind: 'aura' | 'sus') => {
    if (!current?.id) return;
    if (!session?.user) {
      if (kind !== 'aura') return;
      likes.toggleLike({
        id: current.id,
        title: current.title,
        trackType: current.isSoundcloud ? 'SOUNDCLOUD' : 'LOCAL',
        duration: current.duration,
        coverUrl: current.coverUrl ?? null,
        artistLabel: current.artist,
        soundcloudEmbedUrl: current.soundcloudEmbedUrl ?? null,
      });
      return;
    }
    const previous = voteState;
    const next = {
      trackId: current.id,
      aura: kind === 'aura' ? !(previous?.aura ?? false) : (previous?.aura ?? false),
      sus: kind === 'sus' ? !(previous?.sus ?? false) : (previous?.sus ?? false),
    };
    setVoteState(next);
    try {
      const res = await fetch(`/api/tracks/${current.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aura: next.aura,
          sus: next.sus,
          listenedSeconds: Math.max(60, listenedSeconds), // Backend-Min ist 60
        }),
      });
      if (!res.ok) {
        setVoteState(previous);
      } else {
        // My Playlist synchron halten (Aura+ speist den MINE-Channel).
        likes.refresh();
      }
    } catch {
      setVoteState(previous);
    }
  };

  if (hide) return null;

  // Bei OFF AIR pressen wir Hint + Status auf eine Zeile und lassen die
  // zweite Zeile leer — auf Mobile passt sonst weder „OFF AIR" noch
  // „pick a channel" sauber rein.
  const trackTitle =
    current?.title ?? (radioSlot ? t('mini.loading') : t('mini.offAir'));
  const trackArtist = current?.artist ?? '';
  // Wenn ein Subgenre-Override aktiv ist (z.B. Hardtek-Slot mit Raggatek-Set),
  // zeigen wir das Override-Label ('RAGGATEK SET'). Sonst das Original-Label.
  const setName = channelAccent.channel === 'mine'
    ? channelAccent.label // 'MY PLAYLIST' (ADR-041)
    : channelAccent.isSubgenreOverride
      ? channelAccent.label
      : radioSlot?.label ?? null;
  const isOffAir = !radioSlot;
  const canVote = !!session?.user && !!current?.id;
  // AURA+ ist auch anonym klickbar (Session-Like, ADR-041); Anzeige-Zustand
  // kommt für Anonyme aus dem LikesProvider statt aus voteState.
  const canAura = !!current?.id;
  const auraActive = session?.user
    ? (voteState?.aura ?? false)
    : current ? likes.likedIds.has(current.id) : false;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PULSE_KEYFRAMES }} />
      <div
        role="region"
        aria-label={t('mini.regionLabel')}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          // Subtiler Vulkanglas-Touch: nur die diagonalen Schliff-Linien
          // über dem schwarzen Grund. Kein Korn + keine Pseudo-Layer,
          // damit der Equalizer im Hintergrund unverfaelscht durchscheint.
          background: `
            linear-gradient(118deg, transparent 28%, rgba(255,255,255,0.04) 28.3%, transparent 28.6%),
            linear-gradient(142deg, transparent 64%, rgba(255,255,255,0.05) 64.2%, transparent 64.5%),
            linear-gradient(95deg, transparent 41%, rgba(63,207,74,0.04) 41.2%, transparent 41.4%),
            rgba(10,11,12,0.85)
          `,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: `1px solid ${accent}40`,
          boxShadow: `0 -4px 24px rgba(0,0,0,0.6), 0 -1px 0 ${accent}20`,
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
          // overflow:hidden, damit der absolut positionierte Equalizer-Canvas
          // nicht über die Bar hinaus läuft.
          overflow: 'hidden',
        }}
      >
        {/* === Equalizer-Hintergrund — auf die Content-Breite begrenzt ===
            Radio Sync v2 Fix: vorher füllte der Equalizer die volle Viewport-Breite,
            während der Player-Inhalt auf maxWidth 1400 zentriert ist → auf breiten
            Screens quollen die grünen Balken links/rechts aus dem Inhalt heraus.
            Jetzt deckt der Equalizer exakt die zentrierte Content-Box ab. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100%',
            maxWidth: 1400,
            pointerEvents: 'none',
          }}
        >
          <PlayerBackgroundEqualizer
            getFrequencyData={analyser.getFrequencyData}
            isActive={isPlayingAudible}
            accentColor={channelAccent.equalizerColor}
            barCount={56}
          />
        </div>

        {/* AI-Tag-Pill ist jetzt INLINE zwischen den Channel-Tabs platziert
            (siehe channels-div) — vorheriger absolute-Block ragte aus dem
            Player-Container und wurde von overflow:hidden halbiert. */}

        <div
          className="kbk-miniplayer-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            // Höher auf Mobile (Touch-Fläche + intuitiv erkennbar als Player-Bedienzone).
            minHeight: 72,
            maxWidth: 1400,
            margin: '0 auto',
            // Buttons + Labels gehören VOR den Equalizer-Hintergrund.
            position: 'relative',
            zIndex: 10,
          }}
        >
          {/* Logo — auch hier klickbar als Tune-In (mute/unmute Toggle wenn schon live).
              Touch-Target 44x44 (WCAG 2.5.5), Image bleibt 36x36 zentriert. */}
          <button
            type="button"
            onClick={() => {
              if (audio.volume === 0) {
                audio.setVolume(prevVolumeRef.current || 0.7);
              } else if (!radioMode) {
                // Aus dem MINE-Modus zurück ins Radio: erst den Channel
                // korrigieren, sonst pollt der Sync einen Nicht-Radio-Channel.
                if (selectedChannel === 'mine') setSelectedChannel('phonk');
                enterRadioMode().catch(() => {});
              }
            }}
            aria-label={t('mini.tuneIn')}
            style={{
              flexShrink: 0,
              width: 44,
              height: 44,
              position: 'relative',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Image
              src="/images/logo-4flow.png"
              alt="KBK"
              width={36}
              height={36}
              style={{
                filter: `drop-shadow(0 0 6px ${accent})`,
                imageRendering: 'auto',
                animation: radioMode && !isMuted ? 'kk-pulse 1.4s ease-in-out infinite' : undefined,
              }}
            />
          </button>

          {/* Channel-Tabs — funktional, aktive Channels pulsen.
              Mobile: nur Initialen (P/H) damit Aura/Sus rechts noch passt. */}
          <div
            className="kbk-miniplayer-channels"
            style={{ display: 'flex', gap: 0, flexShrink: 0, alignItems: 'center' }}
            aria-label={t('mini.chooseChannel')}
          >
            {/* LIVE-Tab nur zeigen, während ein Live-Event läuft (ADR-028). */}
            {CHANNELS.filter((c) => c.id !== 'live' || activeChannels.includes('live')).map((c) => {
              const isActive = activeChannel === c.id;
              const isLive = activeChannels.includes(c.id);
              // v2.26 (07.05.2026): Wenn dieser Tab dem aktiven Channel
              // entspricht UND ein Subgenre-Override aktiv ist, nimmt der Tab
              // die grüne Special-Event-Farbe (statt Phonk-Red / Hardtek-Yellow).
              const tabColor =
                isActive && channelAccent.isSubgenreOverride
                  ? channelAccent.color
                  : c.color;
              const frameClass =
                isActive && channelAccent.isSubgenreOverride
                  ? ' kbk-frame-green'
                  : c.id === 'phonk'
                    ? ' kbk-frame-red'
                    : c.id === 'hardtek'
                      ? ' kbk-frame-yellow'
                      : ''; // live: Magenta kommt über obsidianFrameVars(tabColor)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleChannelClick(c.id)}
                  aria-pressed={isActive}
                  aria-label={c.label}
                  title={
                    c.id === 'mine'
                      ? t('mine.tooltip')
                      : `${c.label} ${isLive ? t('mini.channelLive') : t('mini.channelOffAir')}${
                          isActive && channelAccent.isSubgenreOverride
                            ? ` — ${channelAccent.label}`
                            : ''
                        }`
                  }
                  // v2.18 (re-apply v2.14): Channel-Tabs auf Obsidian +
                  // framed mit Pulse-Speed-Signal — Active=1s, Live=1.5s,
                  // Off-Air=4s. Color folgt dem Channel.
                  // v2.26 (07.05.2026): Frame + Color reagieren auf
                  // Special-Event-Subgenre (Brazilian Phonk → green).
                  className={`kbk-obsidian framed${frameClass}`}
                  style={{
                    ...obsidianFrameVars(tabColor),
                    background: isActive ? tabColor : undefined,
                    // MINE: weiße Schrift auf Anthrazit — die dunkle Standard-
                    // Schrift (#0A0B0C) wäre auf #4A4E55 unlesbar (Kontrast).
                    color: isActive
                      ? (c.id === 'mine' ? '#fff' : '#0A0B0C')
                      : isLive ? tabColor : 'rgba(255,255,255,0.7)',
                    padding: '8px 14px',
                    fontFamily: 'var(--font-display)',
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.12em',
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                    whiteSpace: 'nowrap',
                    minHeight: 44,
                    minWidth: 40,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    animationDuration: isActive ? '1.0s' : isLive ? '1.5s' : '4s',
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* Track-Info — flex:1.
              Klasse für Mobile-Layout-Rule (<420px: order=2, full-width).
              v2.16: opaker Background damit Equalizer-Bars nicht durch den
              Titel schimmern. Plus text-shadow für extra Kontrast. */}
          <div
            className="kbk-miniplayer-track"
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              lineHeight: 1.2,
              background: 'rgba(10,11,12,0.82)',
              padding: '6px 10px',
              borderRadius: 2,
            }}
          >
            {/* v2.31: LIVESTREAM-Übernahme. Wenn der Slot ein Twitch-Live-Event
                ist, ersetzen wir die normale Track-Info komplett mit einem
                pulsierenden LIVESTREAM-Block, der zu /radio führt. */}
            {liveTwitchChannel ? (
              <Link
                href="/radio"
                aria-label={t('mini.watchLiveTwitch', { channel: liveTwitchChannel })}
                className="kbk-livestream-pulse kbk-livestream-bg"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  color: '#fff',
                  padding: '6px 10px',
                  margin: '-6px -10px',
                  borderRadius: 2,
                  border: '1px solid rgba(145,70,255,0.85)',
                  minHeight: 56,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    aria-hidden="true"
                    className="kbk-livestream-blink"
                    style={{
                      display: 'inline-block',
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: '#FF3B6B',
                      color: '#FF3B6B',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    className="kbk-livestream-shake"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 13,
                      fontWeight: 900,
                      letterSpacing: '0.1em',
                      color: '#fff',
                      textShadow: '0 0 8px rgba(145,70,255,0.95), 0 1px 2px rgba(0,0,0,0.95)',
                      textTransform: 'uppercase',
                    }}
                  >
                    🔴 {t('mini.livestreamNow')}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.92)',
                    letterSpacing: '0.05em',
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  twitch.tv/{liveTwitchChannel} · {t('mini.tapToWatch')}
                </div>
              </Link>
            ) : (
            <>
            {/* Status-Zeile: ON-AIR-Indikator + AI-Tag-Pille nebeneinander.
                Beides Track-/Slot-Status-Signale — sie gehören zusammen statt
                zwischen die Channel-Tabs (v2.23: AI-Pill aus Channel-Reihe
                rausgezogen, Flow-Pushback). */}
            {(!isOffAir || aiTag.label) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 2,
                  flexWrap: 'wrap',
                }}
              >
                {!isOffAir && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: '#E63B2E',
                        boxShadow: '0 0 6px #E63B2E, 0 0 12px rgba(230,59,46,0.6)',
                        animation: 'kk-pulse 1s infinite',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: '#E63B2E',
                        letterSpacing: '0.2em',
                        fontWeight: 700,
                      }}
                    >
                      {t('status.onAir')}
                    </span>
                  </span>
                )}
                {aiTag.label && (
                  <span
                    aria-label={t('mini.aiTag', { label: aiTag.label })}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: 'rgba(139,92,246,0.92)',
                      color: '#fff',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      boxShadow: '0 2px 8px rgba(139,92,246,0.35), 0 0 0 1px rgba(255,255,255,0.10) inset',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {aiTag.label}
                  </span>
                )}
                {/* Radio Sync v2: stiller Sync-Punkt. Text + ⓘ bewusst entfernt — nur ein
                    dezenter Status-Dot (grün=in sync, pulsierender Akzent=beatmatching).
                    Bleibt klickbar/hoverbar fürs Info-Modal, damit der Punkt erklärbar ist. */}
                {radioMode && !isOffAir && syncStatus !== 'idle' && (
                  <button
                    type="button"
                    onClick={() => setShowSyncInfo(true)}
                    aria-label={`${t(`sync.${syncStatus}`)} — ${t('sync.infoAria')}`}
                    title={t(`sync.${syncStatus}`)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 6,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      flexShrink: 0,
                      lineHeight: 0,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background:
                          syncStatus === 'synced'
                            ? '#3FCF4A'
                            : syncStatus === 'beatmatching'
                              ? accent
                              : 'rgba(255,255,255,0.6)',
                        boxShadow: syncStatus === 'synced' ? '0 0 6px #3FCF4A' : undefined,
                        animation: syncStatus !== 'synced' ? 'kk-pulse 1s infinite' : undefined,
                        flexShrink: 0,
                      }}
                    />
                  </button>
                )}
              </div>
            )}
            <div
              ref={titleWrapRef}
              className="kbk-miniplayer-title-wrap"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: '0.04em',
                color: isOffAir ? 'rgba(255,255,255,0.5)' : '#fff',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                // v2.16: Text-Shadow gibt extra Kontrast gegen Equalizer-Backdrop.
                textShadow: '0 0 6px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.95)',
                position: 'relative',
              }}
              title={trackTitle}
            >
              <span
                ref={titleInnerRef}
                className={titleOverflowPx > 0 ? 'kbk-track-marquee-active' : undefined}
                style={
                  titleOverflowPx > 0
                    ? ({
                        display: 'inline-block',
                        whiteSpace: 'nowrap',
                        ['--kbk-marquee-end' as string]: `-${titleOverflowPx}px`,
                        ['--kbk-marquee-duration' as string]: `${marqueeDuration}s`,
                      } as React.CSSProperties)
                    : {
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }
                }
              >
                {trackTitle}
              </span>
            </div>
            <div
              className="kbk-miniplayer-meta"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'rgba(255,255,255,0.55)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: 2,
              }}
              title={`${trackArtist}${setName ? ' · ' + setName : ''}`}
            >
              {trackArtist}
              {setName && <span> · {setName}</span>}
            </div>
            </>
            )}
          </div>

          {/* Volume-Slider — auf <md hidden, da der Mute-Button reicht */}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(audio.volume * 100)}
            onChange={handleVolumeChange}
            aria-label={t('volume.label')}
            className="kbk-miniplayer-volume hidden md:block"
            style={{
              flexShrink: 0,
              width: 80,
              height: 4,
              accentColor: accent,
              cursor: 'pointer',
            }}
          />

          {/* Mute-Toggle — neutrale Optik, Icon wechselt (Volume2 / VolumeX im lucide-Stil).
              Touch-Target 44x44 (WCAG 2.5.5). */}
          <button
            type="button"
            onClick={handleMuteToggle}
            aria-label={isMuted ? t('volume.unmute') : t('volume.mute')}
            aria-pressed={isMuted}
            title={isMuted ? t('volume.unmute') : t('volume.mute')}
            style={{
              flexShrink: 0,
              width: 44,
              minWidth: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(10,11,12,0.82)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: isMuted ? 'rgba(255,255,255,0.55)' : '#fff',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {isMuted ? (
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                <line x1="22" y1="9" x2="16" y2="15" />
                <line x1="16" y1="9" x2="22" y2="15" />
              </svg>
            ) : (
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>

          {/* AURA+ — positives Vote. Mobile: nur Symbol, 44x44 Touch-Target.
              Pulsierender Glow via .kbk-aura-glow — greift sobald der User
              eingeloggt ist (auch ohne aktiven Track). Disabled-State bleibt
              für Click-Logik gleich (kein Vote ohne Track), aber der
              Button-Glow signalisiert "hier passiert was" als Marken-Element. */}
          <button
            type="button"
            onClick={() => submitVote('aura')}
            disabled={!canAura}
            aria-label={t('vote.markAura')}
            aria-pressed={auraActive}
            title={canAura ? (session?.user ? t('vote.auraTitle') : t('vote.auraAnonTitle')) : t('vote.auraTitle')}
            className={session?.user ? 'kbk-aura-glow' : undefined}
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              minWidth: 44,
              minHeight: 44,
              justifyContent: 'center',
              background: auraActive ? '#3FCF4A' : 'rgba(10,11,12,0.82)',
              color: auraActive ? '#0A0B0C' : (canAura ? '#3FCF4A' : 'rgba(63,207,74,0.35)'),
              border: `1px solid ${canAura ? '#3FCF4A' : 'rgba(63,207,74,0.35)'}`,
              fontFamily: 'var(--font-display)',
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: '0.1em',
              cursor: canAura ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
            <span aria-hidden="true">✦</span>
            <span className="kbk-aura-label" style={{ fontSize: 10 }}> AURA+</span>
          </button>

          {/* SUS — negatives/skeptisches Vote. Mobile: nur Symbol, 44x44 Touch-Target. */}
          <button
            type="button"
            onClick={() => submitVote('sus')}
            disabled={!canVote}
            aria-label={t('vote.markSus')}
            aria-pressed={voteState?.sus ?? false}
            title={canVote ? t('vote.susTitle') : t('vote.loginRequired')}
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              minWidth: 44,
              minHeight: 44,
              justifyContent: 'center',
              background: voteState?.sus ? '#E63B2E' : 'rgba(10,11,12,0.82)',
              color: voteState?.sus ? '#0A0B0C' : (canVote ? '#E63B2E' : 'rgba(230,59,46,0.35)'),
              border: `1px solid ${canVote ? '#E63B2E' : 'rgba(230,59,46,0.35)'}`,
              fontFamily: 'var(--font-display)',
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: '0.1em',
              cursor: canVote ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
            <span aria-hidden="true">⊘</span>
            <span className="kbk-sus-label" style={{ fontSize: 10 }}> SUS</span>
          </button>
        </div>
      </div>

      {/* Radio Sync v2: Info-Modal — erklärt den „Conductor"/Beatmatch in
          Plain-Language. Technik bleibt hinter dem (i)-Button versteckt. */}
      {showSyncInfo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('sync.modalTitle')}
          onClick={() => setShowSyncInfo(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            padding: 16,
          }}
        >
          <div
            className="kbk-obsidian framed"
            onClick={(e) => e.stopPropagation()}
            style={{
              ...obsidianFrameVars(accent),
              maxWidth: 460,
              width: '100%',
              padding: 24,
              borderRadius: 14,
              color: '#fff',
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: '0.02em',
                margin: '0 0 6px',
              }}
            >
              {t('sync.modalTitle')}
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: accent,
                margin: '0 0 14px',
              }}
            >
              {t('sync.modalTagline')}
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.82)', margin: 0 }}>
              {t('sync.modalBody')}
            </p>
            <button
              type="button"
              onClick={() => setShowSyncInfo(false)}
              style={{
                marginTop: 18,
                padding: '8px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                background: accent,
                color: '#0A0B0C',
                border: 'none',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                letterSpacing: '0.08em',
                fontSize: 12,
              }}
            >
              {t('sync.modalClose')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
