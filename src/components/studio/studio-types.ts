/**
 * Studio-Typen + Status-Konventionen (ADR-041 Welle 3)
 *
 * Gemeinsame API-Shapes der /api/studio-Routen (Envelope {success,data,error})
 * und die Badge-Farb-Map für Submission-Status — an EINER Stelle, damit
 * Dashboard + Tracks-Seite nicht driften.
 */

// GET /api/studio/profile → data.profile
export interface StudioProfile {
  slug: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  headerUrl: string | null;
  socialSoundcloud: string | null;
  socialInstagram: string | null;
  socialTelegram: string | null;
  socialWebsite: string | null;
  isPublished: boolean;
  claimedAt: string | null;
}

// GET /api/studio/tracks → data.tracks[n].submission
export interface StudioSubmission {
  status: string; // PENDING | CHANGES_REQUESTED | APPROVED | REJECTED
  reviewNote: string | null;
  updatedAt: string;
}

// GET /api/studio/tracks → data.tracks[n]
export interface StudioTrack {
  id: string;
  title: string;
  slug: string;
  trackType: string;
  duration: number;
  coverUrl: string | null;
  genre: string;
  bpm: number | null;
  isPublic: boolean;
  aiDisclosure: string;
  isrc: string | null;
  label: string | null;
  playCount: number;
  auraCount: number;
  submission: StudioSubmission | null;
}

/** Anzeige-Status einer Zeile: ohne Submission = DRAFT, sonst Submission-Status. */
export function trackDisplayStatus(track: StudioTrack): string {
  return track.submission?.status ?? 'DRAFT';
}

/** Badge-Farben (Obsidian-Palette, Muster Admin-Missions-Cockpit). */
export const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-white/10 text-muted',
  PENDING: 'bg-amber-500/15 text-amber-400',
  CHANGES_REQUESTED: 'bg-orange-500/15 text-orange-400',
  APPROVED: 'bg-rasta-green/15 text-rasta-green',
  REJECTED: 'bg-rasta-red/15 text-rasta-red',
};

/** Nur solange darf der Artist editieren / re-submitten (Server-Guard identisch). */
export function isTrackEditable(track: StudioTrack): boolean {
  const status = track.submission?.status;
  return status === 'PENDING' || status === 'CHANGES_REQUESTED';
}
