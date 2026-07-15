/**
 * Boomy-Helper — gemeinsame Logik für Release-Pipeline, Pool-Status und Wall-Posts.
 *
 * **Wichtig:** Boomy ist auf KBK ein One-Way-Sprachrohr — er postet/dropt, reagiert
 * nicht auf User. Diese Helper produzieren nur Output-Texte und Status-Daten,
 * keine Reaktions-Logik. Discord-Bot-Replies kommen später als eigene Schicht.
 *
 * Wall-Post-Texte sind hier als organische Variation aus Bausteinen komponiert —
 * Platzhalter, bis der externe Boomy-Agent via kbk-mcp echte LLM-generierte Posts liefert.
 */

import prisma from '@/lib/db';
import { AI_DISCLOSURE, BOOMY_CONFIG } from '@/lib/constants';

// === Release-Queue ===
//
// Pool-Restrukturierung 16.05.2026: Es gibt keine Source-Pools mehr. Boomys
// Release-Queue = alle KI-Tracks (aiDisclosure='ai_generated'), die noch nicht
// öffentlich sind (isPublic=false). Alle 2 Tage macht der Cron einen public.

export interface ReleaseQueueStats {
  waitingTracks: number;   // ai_generated + isPublic=false
  publicTracks: number;    // ai_generated + isPublic=true
  byGenre: Array<{ genre: string; waiting: number; live: number }>;
  belowThreshold: boolean; // waitingTracks < BOOMY_CONFIG.poolLowThreshold
}

/**
 * Liefert den Status von Boomys Release-Queue. Genutzt vom Admin-Status-Widget
 * und vom Tagesreport.
 */
export async function getReleaseQueueStats(): Promise<ReleaseQueueStats> {
  const tracks = await prisma.track.findMany({
    where: {
      aiDisclosure: AI_DISCLOSURE.AI_GENERATED,
      status: { not: 'ARCHIVED' },
    },
    select: { genre: true, isPublic: true },
  });

  const genreMap = new Map<string, { waiting: number; live: number }>();
  for (const t of tracks) {
    const g = t.genre || 'Unbekannt';
    const entry = genreMap.get(g) ?? { waiting: 0, live: 0 };
    if (t.isPublic) entry.live += 1;
    else entry.waiting += 1;
    genreMap.set(g, entry);
  }

  const waitingTracks = tracks.filter((t) => !t.isPublic).length;

  return {
    waitingTracks,
    publicTracks: tracks.length - waitingTracks,
    byGenre: [...genreMap.entries()]
      .map(([genre, c]) => ({ genre, ...c }))
      .sort((a, b) => a.genre.localeCompare(b.genre)),
    belowThreshold: waitingTracks < BOOMY_CONFIG.poolLowThreshold,
  };
}

// === Release-Pipeline ===

export interface ReleaseCandidate {
  trackId: string;
  title: string;
  genre: string;
}

/**
 * Wählt einen Release-Kandidaten aus Boomys Release-Queue (KI-Tracks mit
 * isPublic=false). Mit `opts.trackId` exakt diesen — sonst zufällig.
 *
 * Der explizite-ID-Modus erlaubt das Peek-then-Finalize-Pattern: erst peek
 * (nur lesen), dann Cover generieren, dann auto-publish mit gleicher ID.
 *
 * Liefert null, wenn die Queue leer ist oder die ID nicht (mehr) wartet.
 */
export async function pickReleaseCandidate(opts?: { trackId?: string }): Promise<ReleaseCandidate | null> {
  const waiting = await prisma.track.findMany({
    where: {
      aiDisclosure: AI_DISCLOSURE.AI_GENERATED,
      isPublic: false,
      status: { not: 'ARCHIVED' },
    },
    select: { id: true, title: true, genre: true },
  });

  if (waiting.length === 0) return null;

  const candidates: ReleaseCandidate[] = waiting.map((t) => ({
    trackId: t.id,
    title: t.title,
    genre: t.genre || 'unknown',
  }));

  if (opts?.trackId) {
    return candidates.find((c) => c.trackId === opts.trackId) ?? null;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

// === Wall-Post-Generator (organische Variation) ===
//
// Aktueller Stand: Bausteine + Zufalls-Komposition (~1000 Kombinationen).
// Reicht für die ersten Wochen. Sobald kbk-mcp + der externe Boomy-Agent stehen,
// werden diese Funktionen durch echte LLM-Calls ersetzt — die Persona schreibt
// dann freitextlich, statt aus Bausteinen.
//
// Anti-Templating-Schutz: zuletzt verwendete Indizes werden in der DB nicht
// gemerkt; stattdessen wird beim Drop ein Suffix mit Track-Daten eingebaut,
// das jeden Post unverwechselbar macht.

const RELEASE_OPENERS = [
  'Yo wolfpack',
  'Alright crew',
  'Listen up',
  'Big news',
  'Just hit the deck',
  'Hot off the press',
  'Fresh out the lab',
  'Heads up',
  'Quick one',
  '👀',
  'Pulled the trigger',
  'New drop alert',
] as const;

const RELEASE_VERBS = [
  'just dropped',
  'sliding into rotation',
  'fresh on the airwaves',
  'going live with',
  'pushing through',
  'spinning up',
  'cueing up',
  'kicking off',
  'breaking out',
  'lighting up',
] as const;

const RELEASE_CLOSERS = [
  'turn it up.',
  'hope you feel it.',
  "let's see what y'all got.",
  'feedback welcome.',
  "don't sleep on this one.",
  'tune in and judge for yourself.',
  'crank the volume.',
  'hit that AURA+ if it slaps.',
  'tell me how it lands.',
  "this one's for the night shift.",
  'ride it out with me.',
  'pure heat — drop a vote.',
] as const;

const GENRE_FLAVOR: Record<string, readonly string[]> = {
  Phonk: ['memphis grit', 'cowbell-driven heat', 'low-end menace'],
  Hardtek: ['kicks for days', 'pure energy', 'rave-ready voltage'],
  Raggatek: ['dub vibes meet hard kicks', 'sound system warfare', 'bass lab business'],
  'Brazilian Phonk': ['baile funk pressure', 'tamborzão bounce', 'favela-rave heat'],
};

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Erzeugt einen organisch wirkenden Drop-Announce-Text für die KBK-Wall.
 * Niemals zwei mal exakt der gleiche Text — Track-Titel ist immer dabei.
 */
export function composeReleaseAnnouncement(opts: {
  title: string;
  genre?: string;
}): string {
  const opener = pickRandom(RELEASE_OPENERS);
  const verb = pickRandom(RELEASE_VERBS);
  const closer = pickRandom(RELEASE_CLOSERS);

  const flavor = opts.genre && GENRE_FLAVOR[opts.genre]
    ? ` (${pickRandom(GENRE_FLAVOR[opts.genre])})`
    : '';

  return `${opener} — ${verb} "${opts.title}"${flavor}. ${closer}`;
}

/**
 * Wall-Post für externe Uploads (= Tracks von Mitgliedern, die Flow eingespielt hat).
 */
const UPLOAD_HYPE_OPENERS = [
  'New blood',
  'Crew expanding',
  'Welcome a new voice',
  'Pack just got louder',
  'Look who joined',
  'Fresh face on deck',
] as const;

const UPLOAD_HYPE_CLOSERS = [
  'show some love.',
  'go check the profile.',
  'spin it, support it.',
  'support the artist.',
  "let's give them a proper KBK welcome.",
] as const;

export function composeUploadHype(opts: {
  title: string;
  artistDisplayName: string;
  genre?: string;
}): string {
  const opener = pickRandom(UPLOAD_HYPE_OPENERS);
  const closer = pickRandom(UPLOAD_HYPE_CLOSERS);
  const flavor = opts.genre ? ` — ${opts.genre.toLowerCase()} territory` : '';

  return `${opener}: ${opts.artistDisplayName} just dropped "${opts.title}"${flavor}. ${closer}`;
}

/**
 * Inspirational Quote — kurzer Push-Text für KI-Awareness-Mission.
 * Wird vom Tagesreport ggf. zusätzlich auf die Wall gestellt (nicht jeden Tag).
 */
const INSPIRATION_LINES = [
  'AI without vision is noise. Vision without AI is slow. Bring both.',
  "Every track in here started as someone's stupid little idea. Yours next?",
  'Skeptics watch. Conductors create. Pick a side.',
  'The tools change. The hunger stays the same.',
  'Stop waiting for permission. The lab is open.',
  "If a machine can dream up a beat, you can dream up something with it.",
  'Phonk is mood. Hardtek is muscle. Raggatek is the messenger. Find yours.',
  'We post drops, not waiting rooms.',
  'AI is not a shortcut. It is a louder pen.',
  'Fear gets quiet when you start making things.',
] as const;

export function composeInspirationLine(): string {
  return pickRandom(INSPIRATION_LINES);
}

// === Pool-Zuordnung beim Upload ===

/**
 * Hängt einen Track in den Pool mit dem gegebenen Slug ein (PoolTrack-Eintrag).
 * Idempotent: doppelte Aufrufe legen nicht doppelt an.
 */
export async function attachTrackToPool(trackId: string, poolSlug: string): Promise<void> {
  const pool = await prisma.pool.findUnique({ where: { slug: poolSlug } });
  if (!pool) {
    console.warn(`[boomy] attachTrackToPool: pool "${poolSlug}" not found — skip`);
    return;
  }

  await prisma.poolTrack.upsert({
    where: { poolId_trackId: { poolId: pool.id, trackId } },
    create: { poolId: pool.id, trackId },
    update: {},
  });
}
