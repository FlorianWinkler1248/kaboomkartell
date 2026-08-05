/**
 * useRadioSync — „The Conductor" (Radio Sync v2)
 *
 * Der Server ist der Dirigent: er liefert pro Poll die autoritative Zeitlinie
 * (laufender Track + absolute `startedAt`/`endsAt` in Server-Zeit + gelockter
 * nächster Track). Der Client koppelt sein lokales `<audio>` per Phase-Locked-Loop
 * an den Taktstock — ein 1s-Regelkreis ruft das reine Regelgesetz
 * `computeSyncAction` (siehe `@/lib/radio-sync-control`) und gleicht Drift per
 * minimalem Tempo-Nudge (Tempo-only, unhörbar) aus; großer Versatz → harter
 * Re-Seek; Track-Ende → schedule-getriebener Wechsel.
 *
 * Damit entfällt der frühere Sonderfall-Wust (300s-Schwelle, „<3s"-Mid-Cut,
 * „Client voraus"): EIN Regelgesetz hält die Wiedergabe stabil und skalierbar,
 * unabhängig von Browser-Uhr-Offset und DB-/MP3-Dauer-Drift.
 *
 * Channel-Modell: Phonk / Hardtek (+ LIVE nur während Stream-Events). Der
 * `channel`-Param geht mit jedem Request mit; bei Wechsel synchronisiert der Hook
 * auf den neuen Channel. Off-Air (`data: null`) → Audio pausiert, Schedule leer.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { RADIO_CONFIG } from '@/lib/constants'
import { computeSyncAction, needsPlaybackKick, statusForAction, type SyncStatus } from '@/lib/radio-sync-control'
import { radioPreloader, shouldPreload } from '@/lib/radio-preload'
import type { PlayerTrack } from '@/types'

/** Radio Sync v3 (ADR-040) — Kill-Switch Stufe 2: pro Gerät ohne Deploy.
 *  `localStorage.kbk_radio_v3 = 'off'` → kein Blob-Preload UND keine v3-Inputs
 *  ans Regelgesetz (exaktes v2-Verhalten, per Test belegt). */
function isV3Off(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('kbk_radio_v3') === 'off'
  } catch {
    return false
  }
}

interface RadioSlotInfo {
  id: string
  label: string
  type: 'weekly' | 'event'
}

interface NowPlayingTrack {
  id: string
  title: string
  artist: string
  duration: number
  streamUrl: string
  coverUrl?: string | null
}

interface NowPlayingResponse {
  track: NowPlayingTrack | null
  positionSeconds: number
  slot: RadioSlotInfo
  nextTrack: NowPlayingTrack | null
  /** Radio Sync v2: absolute Server-Zeitstempel der laufenden Track-Instanz. */
  startedAt?: string
  endsAt?: string
  slotEndsAt: string
  serverTime: string
  eventType?: string
  streamUrl?: string
  /** Agency-Loop (18.06.2026, ADR-033): Herkunft des laufenden Tracks (VOTE|RANDOM|SEED). */
  currentSource?: 'VOTE' | 'RANDOM' | 'SEED' | null
  /** Agency-Loop: Crowd-Control-Fenster-ID des laufenden Tracks (N+2-Match client-seitig). */
  currentDecisionSeq?: number | null
}

interface NowPlayingEnvelope {
  success: boolean
  data: NowPlayingResponse | null
  activeChannels?: string[]
  serverTime?: string
  channel?: string | null
  message?: string
}

interface UseRadioSyncReturn {
  radioMode: boolean
  radioSlot: RadioSlotInfo | null
  radioNextTrack: PlayerTrack | null
  radioLoading: boolean
  isLiveEvent: boolean
  liveStreamUrl: string | null
  activeChannels: string[]
  /** Agency-Loop (18.06.2026, ADR-033): Herkunft des laufenden Radio-Tracks. */
  radioCurrentSource: 'VOTE' | 'RANDOM' | 'SEED' | null
  /** Agency-Loop: Crowd-Control-Fenster-ID des laufenden Tracks (für N+2-Pick-Match). */
  radioCurrentDecisionSeq: number | null
  /** Beatmatch-Status für den Player-Indikator. */
  syncStatus: SyncStatus
  /** Geschätzte Server-Zeit JETZT (ms) — clock-offset-korrigiert. Für Countdown-UIs. */
  getServerNow: () => number
  enterRadioMode: () => Promise<void>
  exitRadioMode: () => void
  /** Vom PlayerProvider beim `ended`-Event gerufen — gapless auf den nächsten Track. */
  handleTrackEnded: () => void
}

/** Gecachte Conductor-Zeitlinie eines Channels. */
interface Schedule {
  serverTrackId: string
  startedAtMs: number
  endsAtMs: number
  currentTrack: PlayerTrack
  nextTrack: PlayerTrack | null
}

function toPlayerTrack(data: NowPlayingTrack | null): PlayerTrack | null {
  if (!data) return null
  return {
    id: data.id,
    title: data.title,
    artist: data.artist,
    duration: data.duration,
    url: data.streamUrl,
    coverUrl: data.coverUrl ?? undefined,
    isLocal: false,
    isSoundcloud: false,
    aiDisclosure: (data as { aiDisclosure?: PlayerTrack['aiDisclosure'] }).aiDisclosure ?? null,
  }
}

/** Median einer kleinen Sample-Liste (robust gegen Jitter/GC-Ausreißer). */
function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function useRadioSync(
  audioPlay: (track: PlayerTrack, getStartSec?: () => number) => void,
  audioSeek: (time: number) => void,
  audioPause: () => void,
  audioSetPlaybackRate: (rate: number) => void,
  audioCurrentTime: number,
  audioDuration: number,
  audioIsPlaying: boolean,
  audioVolume: number,
  channel: string | null,
  // Radio Sync v3 (ADR-040): Stall-Signal des Elements + Blob-Error-Registrierung.
  audioIsStalled: boolean,
  audioSetOnBlobError: (cb: (() => void) | null) => void,
  // Mobile-Continuity (v3.1): Absicht („soll Ton kommen?") + Wiederanwerfen.
  audioGetIntendsToPlay: () => boolean,
  audioEnsurePlaying: () => void,
): UseRadioSyncReturn {
  const [radioMode, setRadioMode] = useState(false)
  const [radioSlot, setRadioSlot] = useState<RadioSlotInfo | null>(null)
  const [radioNextTrack, setRadioNextTrack] = useState<PlayerTrack | null>(null)
  const [radioLoading, setRadioLoading] = useState(false)
  const [isLiveEvent, setIsLiveEvent] = useState(false)
  const [liveStreamUrl, setLiveStreamUrl] = useState<string | null>(null)
  const [activeChannels, setActiveChannels] = useState<string[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  // Agency-Loop (18.06.2026): Herkunft + Fenster-ID des laufenden Tracks, vom Server
  // durchgereicht. Speist die client-seitige „mein Pick läuft"-Erkennung im MiniPlayer.
  const [radioCurrentSource, setRadioCurrentSource] = useState<'VOTE' | 'RANDOM' | 'SEED' | null>(null)
  const [radioCurrentDecisionSeq, setRadioCurrentDecisionSeq] = useState<number | null>(null)

  // --- Refs ---
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const controlRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clockOffsetRef = useRef(0)            // Server-Zeit minus Client-Zeit (ms), gemedianed
  const offsetSamplesRef = useRef<number[]>([])
  const scheduleRef = useRef<Schedule | null>(null)
  const currentTrackIdRef = useRef<string | null>(null)  // was das Audio gerade spielt
  // Nach Switch/Seek kurz nicht erneut korrigieren (Element muss laden/settlen).
  const suppressUntilRef = useRef(0)

  // --- Radio Sync v3 (ADR-040): Regelkreis-Zustand für Stall-Guard + Hysterese ---
  const isSlewingRef = useRef(false)          // letzte Aktion war slew (Hysterese)
  const stalledTicksRef = useRef(0)           // aufeinanderfolgende gestallte Ticks
  const srcIsLocalRef = useRef(false)         // aktuelles Audio spielt aus Blob
  const activeBlobUrlRef = useRef<string | null>(null) // gerade gespielte Blob-URL (nie revoken!)
  const blobRecoveryDoneRef = useRef(false)   // Netz-Replay nach Blob-Fehler nur einmal

  const audioIsStalledRef = useRef(audioIsStalled)
  useEffect(() => { audioIsStalledRef.current = audioIsStalled }, [audioIsStalled])

  const channelRef = useRef<string | null>(channel)
  useEffect(() => { channelRef.current = channel }, [channel])

  const radioModeRef = useRef(false)
  useEffect(() => { radioModeRef.current = radioMode }, [radioMode])

  // Audio-Zustand als Refs (der Control-Tick liest aus setInterval → keine stale closures).
  const audioCurrentTimeRef = useRef(audioCurrentTime)
  const audioDurationRef = useRef(audioDuration)
  const audioIsPlayingRef = useRef(audioIsPlaying)
  const audioVolumeRef = useRef(audioVolume)
  useEffect(() => { audioCurrentTimeRef.current = audioCurrentTime }, [audioCurrentTime])
  useEffect(() => { audioDurationRef.current = audioDuration }, [audioDuration])
  useEffect(() => { audioIsPlayingRef.current = audioIsPlaying }, [audioIsPlaying])
  useEffect(() => { audioVolumeRef.current = audioVolume }, [audioVolume])

  const getServerNow = useCallback(() => Date.now() + clockOffsetRef.current, [])

  // P0.6-Verfeinerung (06.07.2026): „idle" = Tab verdeckt UND niemand hört zu.
  // Nur dann setzen Poll- + Control-Tick aus. Hörbar spielend zählt NICHT als
  // idle — Chrome/Windows meldet auch ein komplett verdecktes Fenster als
  // hidden, und ohne Poll kennt der Client den Folge-Track nicht → Wiedergabe
  // riss am Track-Ende ab, bis der Tab wieder sichtbar wurde.
  //
  // Mobile-Continuity (v3.1): Maßstab ist die ABSICHT, nicht der beobachtete
  // Element-Zustand. Vorher hing hier `audioIsPlayingRef` — ein einziges vom
  // Browser abgelehntes Hintergrund-`play()` setzte das auf false, und weil der
  // Tab bei gesperrtem Handy verdeckt ist, schalteten sich damit Poll UND
  // Regelkreis dauerhaft ab. Der Radio konnte sich nicht mehr selbst erholen —
  // genau das erzwang das manuelle Neu-Einwählen.
  const isHiddenIdle = useCallback(() =>
    typeof document !== 'undefined' && document.hidden &&
    !(audioGetIntendsToPlay() && audioVolumeRef.current > 0), [audioGetIntendsToPlay])

  // Preload des nächsten Tracks. Radio Sync v3 (ADR-040): Voll-Blob-Download nach
  // preloadDelayMs (Join-Bandbreiten-Kollision vermeiden) — der Track-Übergang wird
  // damit eine lokale Operation. Kill-Switch-Kaskade: Config-Flag → localStorage →
  // Runtime-Auto-Kill → Netz-Check; greift einer, läuft der v2-Ghost-Preloader
  // (HTTP-Cache-Warm-up) als erhaltener Fallback-Pfad.
  const preloadedUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!radioNextTrack?.url || radioNextTrack.isSoundcloud) return
    const blobPreloadActive =
      RADIO_CONFIG.blobPreloadEnabled &&
      !isV3Off() &&
      !radioPreloader.isSessionDisabled() &&
      shouldPreload(typeof navigator !== 'undefined' ? (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }) : undefined)
    if (blobPreloadActive) {
      const nextId = radioNextTrack.id
      const nextUrl = radioNextTrack.url
      const timer = setTimeout(() => {
        void radioPreloader.ensure(nextId, nextUrl)
      }, RADIO_CONFIG.preloadDelayMs)
      return () => clearTimeout(timer)
    }
    // v2-Fallback: Ghost-Audio-Preload in den HTTP-Cache (gapless beim Wechsel).
    if (preloadedUrlRef.current === radioNextTrack.url) return
    preloadedUrlRef.current = radioNextTrack.url
    const preloader = new Audio()
    preloader.preload = 'auto'
    preloader.src = radioNextTrack.url
    preloader.load()
  }, [radioNextTrack?.id, radioNextTrack?.url, radioNextTrack?.isSoundcloud])

  // --- Radio Sync v3: Preload-Aufräumen (In-Flight abbrechen + Blobs revoken).
  //     Die gerade aktiv gespielte Blob-URL wird verschont (Element hält sie noch). ---
  const cleanupPreload = useCallback(() => {
    radioPreloader.cancel()
    radioPreloader.releaseAll(activeBlobUrlRef.current ?? undefined)
  }, [])

  // --- Off-Air: Channel sendet nicht ---
  const handleOffAir = useCallback(() => {
    setIsLiveEvent(false)
    setLiveStreamUrl(null)
    setRadioSlot(null)
    setRadioNextTrack(null)
    scheduleRef.current = null
    currentTrackIdRef.current = null
    setSyncStatus('idle')
    setRadioCurrentSource(null)
    setRadioCurrentDecisionSeq(null)
    cleanupPreload()
    audioPause()
  }, [audioPause, cleanupPreload])

  // --- Radio Sync v3: synchroner Track-Resolver — Blob-URL statt Netz-URL, wenn der
  //     Preload fertig ist. KEIN async (Switch-Hot-Path bleibt synchron, ADR-040). ---
  const resolveTrack = useCallback((track: PlayerTrack): PlayerTrack => {
    if (isV3Off()) {
      srcIsLocalRef.current = false
      activeBlobUrlRef.current = null
      return track
    }
    const blobUrl = radioPreloader.resolve(track.id)
    if (!blobUrl) {
      srcIsLocalRef.current = false
      activeBlobUrlRef.current = null
      return track
    }
    srcIsLocalRef.current = true
    activeBlobUrlRef.current = blobUrl
    return { ...track, url: blobUrl }
  }, [])

  // --- Gapless-Wechsel auf den (gelockten) nächsten Track + Schedule-Roll-Forward ---
  // Wird vom Control-Tick (am endsAt) UND vom `ended`-Event (echtes Audio-Ende)
  // gerufen — wer zuerst feuert, gewinnt; der andere sieht „schon erledigt".
  const switchToNext = useCallback(() => {
    const sched = scheduleRef.current
    if (!sched?.nextTrack) return false
    if (currentTrackIdRef.current === sched.nextTrack.id) return false
    const next = sched.nextTrack
    currentTrackIdRef.current = next.id
    audioSetPlaybackRate(1)
    // v3: Start-Position wird im `loadedmetadata`-Moment FRISCH berechnet (Closure) —
    // ersetzt den alten 300ms-Blind-Seek. Referenz = altes endsAt (= Start des Nächsten).
    const refMs = sched.endsAtMs
    audioPlay(resolveTrack(next), () => Math.max(0, (getServerNow() - refMs) / 1000))
    // Lokaler Roll-Forward: der nächste Track ist jetzt „current"; sein Start = altes
    // endsAt, sein Ende = + echte Track-Dauer. Der nächste Poll überschreibt das mit
    // den autoritativen Server-Werten.
    scheduleRef.current = {
      serverTrackId: next.id,
      startedAtMs: sched.endsAtMs,
      endsAtMs: sched.endsAtMs + next.duration * 1000,
      currentTrack: next,
      nextTrack: null,
    }
    setRadioNextTrack(null)
    suppressUntilRef.current = Date.now() + 1000
    return true
  }, [audioPlay, audioSetPlaybackRate, getServerNow, resolveTrack])

  // --- Der Regelkreis: EINE Iteration ---
  const runControlTick = useCallback(() => {
    if (!radioModeRef.current) return
    const sched = scheduleRef.current
    if (!sched) { setSyncStatus('idle'); return }
    if (Date.now() < suppressUntilRef.current) return

    // Mobile-Continuity (v3.1): erst „dreht sich der Teller?", dann „steht die
    // Nadel richtig?". Ein pausiertes Element lässt sich nicht durch Seeken
    // heilen — ohne diesen Anlauf blieb der Radio nach einem abgelehnten
    // Hintergrund-`play()` still, während der Regelkreis munter weiter die
    // Position korrigierte.
    if (needsPlaybackKick({
      radioMode: radioModeRef.current,
      intendsToPlay: audioGetIntendsToPlay(),
      isPlaying: audioIsPlayingRef.current,
      hasLoadedTrack: currentTrackIdRef.current !== null,
      serverNowMs: getServerNow(),
      endsAtMs: sched.endsAtMs,
    })) {
      audioEnsurePlaying()
    }

    // v3-Inputs (ADR-040): Stall-Guard + Hysterese + quellenabhängige Seek-Schwelle.
    // Kill-Switch (localStorage kbk_radio_v3='off') → Felder weglassen = exaktes v2.
    const v3Active = !isV3Off()
    const stalled = v3Active && audioIsStalledRef.current
    stalledTicksRef.current = stalled ? stalledTicksRef.current + 1 : 0

    const action = computeSyncAction({
      serverNowMs: getServerNow(),
      startedAtMs: sched.startedAtMs,
      endsAtMs: sched.endsAtMs,
      serverTrackId: sched.serverTrackId,
      audioTrackId: currentTrackIdRef.current,
      audioTimeSec: audioCurrentTimeRef.current,
      audioDurationSec: audioDurationRef.current,
      nextTrackId: sched.nextTrack?.id ?? null,
      ...(v3Active ? {
        stalled,
        isSlewing: isSlewingRef.current,
        srcIsLocal: srcIsLocalRef.current,
        stalledTicks: stalledTicksRef.current,
      } : {}),
    })
    // Hysterese-Zustand fortschreiben: nur ein Slew hält die enge EXIT-Schwelle aktiv.
    isSlewingRef.current = action.kind === 'slew'

    switch (action.kind) {
      case 'idle':
        break
      case 'hold':
        audioSetPlaybackRate(1)
        break
      case 'slew':
        audioSetPlaybackRate(action.playbackRate)
        break
      case 'seek':
        audioSetPlaybackRate(1)
        audioSeek(action.seekToSec)
        suppressUntilRef.current = Date.now() + 800
        break
      case 'switch': {
        if (sched.nextTrack && action.trackId === sched.nextTrack.id) {
          switchToNext()
        } else if (action.trackId === sched.currentTrack.id) {
          // Track-Wechsel laut Poll (oder Initial-Einstieg) → current laden; Start-
          // Position im `loadedmetadata`-Moment FRISCH berechnen (v3, statt Blind-Seek).
          currentTrackIdRef.current = sched.currentTrack.id
          audioSetPlaybackRate(1)
          const refMs = sched.startedAtMs
          audioPlay(resolveTrack(sched.currentTrack), () => Math.max(0, (getServerNow() - refMs) / 1000))
          suppressUntilRef.current = Date.now() + 1000
        }
        break
      }
    }
    setSyncStatus(statusForAction(action))
  }, [audioPlay, audioSeek, audioSetPlaybackRate, getServerNow, switchToNext, resolveTrack,
      audioGetIntendsToPlay, audioEnsurePlaying])

  // --- Now-Playing holen + Clock-Offset messen (NTP-Mittelpunkt + Median) ---
  const fetchNowPlaying = useCallback(async (): Promise<NowPlayingEnvelope | null> => {
    try {
      const ch = channelRef.current
      const url = ch
        ? `/api/radio/now-playing?channel=${encodeURIComponent(ch)}`
        : '/api/radio/now-playing'
      const tSent = Date.now()
      const res = await fetch(url, { cache: 'no-store' })
      const json = (await res.json()) as NowPlayingEnvelope
      const tRecv = Date.now()
      if (!json.success) return null
      setActiveChannels(json.activeChannels ?? [])
      const serverIso = json.data?.serverTime ?? json.serverTime
      if (serverIso) {
        const samples = offsetSamplesRef.current
        // v3 RTT-Filter (ADR-040): Ausreißer-Roundtrips (>2s, z.B. mobiler Funk-Hänger)
        // verfälschen den NTP-Mittelpunkt → verwerfen. Bootstrap-Regel: die ersten
        // 3 Samples immer akzeptieren, sonst verhungert der Offset auf echtem 2G.
        const rttMs = tRecv - tSent
        if (!(rttMs > 2000 && samples.length >= 3)) {
          const sample = Date.parse(serverIso) - (tSent + tRecv) / 2
          samples.push(sample)
          if (samples.length > 5) samples.shift()
          clockOffsetRef.current = median(samples)
        }
      }
      return json
    } catch (error) {
      console.error('Radio now-playing Fehler:', error)
      return null
    }
  }, [])

  // --- Poll-Antwort übernehmen (Schedule setzen) — KEINE direkte Korrektur hier ---
  const ingest = useCallback((envelope: NowPlayingEnvelope) => {
    const data = envelope.data
    if (!data) { handleOffAir(); return }

    // Live-Stream-Event (YouTube/Twitch) → kein Pool-Track, kein PLL.
    if (data.eventType && data.eventType !== 'POOL') {
      setIsLiveEvent(true)
      setLiveStreamUrl(data.streamUrl ?? null)
      setRadioSlot(data.slot)
      setRadioNextTrack(null)
      scheduleRef.current = null
      currentTrackIdRef.current = null
      setSyncStatus('idle')
      setRadioCurrentSource(null)
      setRadioCurrentDecisionSeq(null)
      audioPause()
      return
    }

    setIsLiveEvent(false)
    setLiveStreamUrl(null)
    setRadioSlot(data.slot)
    // Agency-Loop: Herkunft + Fenster-ID des laufenden Tracks übernehmen (vom Server
    // durchgereicht; deterministischer Pfad liefert null). Der MiniPlayer-Effect liest
    // diese beim Track-Wechsel für die Pick-Erkennung.
    setRadioCurrentSource(data.currentSource ?? null)
    setRadioCurrentDecisionSeq(data.currentDecisionSeq ?? null)

    const currentTrack = toPlayerTrack(data.track)
    const nextTrack = toPlayerTrack(data.nextTrack)
    setRadioNextTrack(nextTrack)

    if (!currentTrack || !data.startedAt || !data.endsAt) return

    scheduleRef.current = {
      serverTrackId: currentTrack.id,
      startedAtMs: Date.parse(data.startedAt),
      endsAtMs: Date.parse(data.endsAt),
      currentTrack,
      nextTrack,
    }
    // Sofort einmal regeln statt auf den nächsten 1s-Tick zu warten (snappy Einstieg).
    runControlTick()
  }, [handleOffAir, audioPause, runControlTick])

  // --- Vom PlayerProvider beim `ended`-Event ---
  const handleTrackEnded = useCallback(() => {
    if (!radioModeRef.current) return
    if (switchToNext()) return
    // Sicherheitsnetz: kein gelockter Folge-Track im Cache (idle Tab hat seit dem
    // letzten Wechsel nicht gepollt) → einmalig nachladen statt still verstummen.
    // Ein Request pro Track-Ende, kein Dauer-Poll — P0.6-Ersparnis bleibt.
    fetchNowPlaying().then((envelope) => { if (envelope) ingest(envelope) })
  }, [switchToNext, fetchNowPlaying, ingest])

  // --- Radio-Modus starten ---
  const enterRadioMode = useCallback(async () => {
    setRadioLoading(true)
    try {
      const envelope = await fetchNowPlaying()
      setRadioMode(true)
      radioModeRef.current = true
      if (envelope) ingest(envelope)

      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        // P0.6: idle Tab (verdeckt + nicht hörbar) pollt nicht (spart Server-Last) —
        // der visibilitychange-Effekt synct beim Sichtbarwerden sofort neu.
        if (isHiddenIdle()) return
        const update = await fetchNowPlaying()
        if (update) ingest(update)
      }, RADIO_CONFIG.pollIntervalMs)

      if (controlRef.current) clearInterval(controlRef.current)
      controlRef.current = setInterval(() => {
        // Der Control-Tick nudged die Wiedergabe gegen den zuletzt gepollten Stand; im
        // idle Tab ist der stale (kein Poll) → aussetzen, beim Sichtbarwerden neu syncen.
        if (isHiddenIdle()) return
        runControlTick()
      }, RADIO_CONFIG.controlTickMs)
    } finally {
      setRadioLoading(false)
    }
  }, [fetchNowPlaying, ingest, runControlTick, isHiddenIdle])

  // --- Channel-Wechsel: sofort neu syncen ---
  useEffect(() => {
    if (!radioMode) return
    currentTrackIdRef.current = null
    scheduleRef.current = null
    // v3: In-Flight-Fetch + Blobs des alten Channels aufräumen (3. Cleanup-Anker).
    cleanupPreload()
    fetchNowPlaying().then((envelope) => { if (envelope) ingest(envelope) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, radioMode])

  // --- P0.6: Tab-Sichtbarkeit. Im idle Tab (verdeckt + nicht hörbar) setzen Poll- +
  //     Control-Tick aus (Guards in den Intervallen); wird der Tab wieder sichtbar,
  //     sofort neu syncen statt aufs Intervall zu warten (analog Channel-Wechsel). ---
  useEffect(() => {
    if (!radioMode) return
    const onVis = () => {
      if (document.hidden) return
      // Mobile-Continuity (v3.1): Beim Zurückkommen zuerst den Teller wieder
      // andrehen, dann die Zeitlinie nachziehen. Nach dem Entsperren zählt
      // jede Sekunde — ein `ingest` allein hätte nur die Position korrigiert.
      audioEnsurePlaying()
      fetchNowPlaying().then((envelope) => { if (envelope) ingest(envelope) })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioMode])

  // --- Radio-Modus beenden ---
  const exitRadioMode = useCallback(() => {
    setRadioMode(false)
    radioModeRef.current = false
    setRadioSlot(null)
    setRadioNextTrack(null)
    setIsLiveEvent(false)
    setLiveStreamUrl(null)
    setSyncStatus('idle')
    setRadioCurrentSource(null)
    setRadioCurrentDecisionSeq(null)
    scheduleRef.current = null
    currentTrackIdRef.current = null
    cleanupPreload()
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (controlRef.current) { clearInterval(controlRef.current); controlRef.current = null }
  }, [cleanupPreload])

  // --- Radio Sync v3: Blob-Playback-Fehler-Recovery. Ein kaputter Blob (z.B. von
  //     Safari beim Memory-Druck evicted) → EINMAL Netz-URL-Replay mit frischem
  //     Offset; der Preload wird per Session-Flag deaktiviert (Runtime-Auto-Kill). ---
  useEffect(() => {
    audioSetOnBlobError(() => {
      // Nur reagieren, wenn WIR gerade einen Preload-Blob spielen: Drag&Drop-Local-
      // Files (Playlist.tsx) sind ebenfalls blob:-Quellen am selben Element — ein
      // kaputtes lokales File darf den Auto-Kill/Recovery nicht fälschlich auslösen.
      if (!radioModeRef.current || !srcIsLocalRef.current) return
      radioPreloader.disableSession('Blob-Playback-error — Fallback auf Netz-URLs.')
      if (blobRecoveryDoneRef.current) return
      blobRecoveryDoneRef.current = true
      const sched = scheduleRef.current
      if (!sched) return
      if (currentTrackIdRef.current !== sched.currentTrack.id) return
      srcIsLocalRef.current = false
      activeBlobUrlRef.current = null
      const refMs = sched.startedAtMs
      audioPlay(sched.currentTrack, () => Math.max(0, (getServerNow() - refMs) / 1000))
      suppressUntilRef.current = Date.now() + 1000
    })
    return () => audioSetOnBlobError(null)
  }, [audioSetOnBlobError, audioPlay, getServerNow])

  // Aufräumen bei Unmount (4. Cleanup-Anker: In-Flight-Fetch + alle Blobs freigeben)
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (controlRef.current) clearInterval(controlRef.current)
      radioPreloader.cancel()
      radioPreloader.releaseAll()
    }
  }, [])

  return {
    radioMode,
    radioSlot,
    radioNextTrack,
    radioLoading,
    isLiveEvent,
    liveStreamUrl,
    activeChannels,
    radioCurrentSource,
    radioCurrentDecisionSeq,
    syncStatus,
    getServerNow,
    enterRadioMode,
    exitRadioMode,
    handleTrackEnded,
  }
}
