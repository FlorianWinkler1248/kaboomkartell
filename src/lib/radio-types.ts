// Client-safe Typen für Crowd Control.
//
// WICHTIG (Client/Server-Boundary): Diese Datei darf KEIN prisma/fs/server-Modul
// importieren — sie wird sowohl server-seitig (radio-state.ts, API-Routen) als auch
// client-seitig (CrowdControl.tsx) importiert. Ein versehentlicher prisma-Import hier
// bricht den Production-Build ("external modules node:module"). Siehe
// feedback_client_server_boundary_pattern + prozesse/kbk-crowd-control.md.

/** Herkunft eines abgespielten Tracks im Play-Log. */
export type RadioSource = 'VOTE' | 'RANDOM' | 'SEED'

/** Ein Vote-Kandidat — einer der (bis zu) 5 wahrscheinlichsten nächsten Tracks. */
export interface Candidate {
  trackId: string
  title: string
  artist: string
  coverUrl?: string | null
  /** Wahrscheinlichkeit P in [0,1] zum Zeitpunkt des Fenster-Starts. */
  probability: number
  /** Aktuelle Live-Stimmen für diesen Kandidaten (Tally des offenen Fensters). */
  votes: number
}

/** Zustand des aktuellen Crowd-Control-Fensters — Vertrag für das Startseiten-Widget
 *  (GET /api/radio/crowd-control). Rein primitive Felder, keine DB-Typen.
 *
 *  ADR-033 (18.06.2026): Gevotet wird das ÜBERNÄCHSTE Lied (N+2); das nächste (N+1) steht
 *  beim Track-Start schon fest und kommt als `upNext*` (fix, kein Vote-Button). */
export interface CrowdControlState {
  channel: string
  /** Monotone Fenster-ID; Vote-POSTs + Reads beziehen sich darauf. */
  decisionSeq: number
  /** Die bis zu 5 Kandidaten fürs N+2-Fenster (übernächstes Lied) inkl. Live-Tally.
   *  Leer, wenn off-air/inaktiv. (ADR-033: vorher Kandidaten fürs nächste Lied.) */
  candidates: Candidate[]
  /** ADR-033: fixer nächster Track (N+1, „UP NEXT"), steht ab Track-Start fest — kein Vote.
   *  null, wenn noch nicht committet (Bestands-Head direkt nach Deploy) oder off-air. */
  upNextTrackId: string | null
  /** Titel des fixen nächsten Tracks (N+1), oder null. */
  upNextTitle: string | null
  /** Artist-Display des fixen nächsten Tracks (N+1), oder null. */
  upNextArtist: string | null
  /** ISO-Zeit, ab wann gevotet werden kann (= startedAt + VOTE_OPEN_DELAY), oder null. */
  windowStartsAt: string | null
  /** ISO-Zeit, wann das Voting schließt/lockt (= endsAt − VOTE_CLOSE_LEAD), oder null. */
  windowEndsAt: string | null
  /** true, sobald der Gewinner eingefroren ist (keine Stimme mehr möglich). */
  locked: boolean
  /** trackId, für den der eingeloggte User gestimmt hat (oder null). */
  myVote: string | null
  /** Bei locked === true: die eingefrorene Gewinner-trackId (für "🔒 next: …"). */
  lockedTrackId: string | null
  /** true, wenn der Sendeplan bereits einen neuen Slot/Genre zeigt, während der gerade
   *  laufende Track noch aus dem vorigen Pool stammt (weiche Übernahme über die Slot-
   *  Grenze) — das Widget kann das als kurzen Hinweis zeigen statt es zu verschweigen. */
  transitioning: boolean
  /** false → Off-Air / kein aktiver Slot / Crowd Control per Kill-Switch aus. */
  active: boolean
}
