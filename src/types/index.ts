/**
 * Gemeinsame TypeScript-Typen für die gesamte Anwendung.
 */

import type { Role, RepeatMode, TrackType, AiDisclosure, PlaylistType, EventType } from '@/lib/constants';

// === User-Typen ===

export interface UserPublic {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: Role;
  bio: string | null;
}

export interface UserAdmin extends UserPublic {
  email: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// === Track-Typen ===

export interface TrackPublic {
  id: string;
  title: string;
  slug: string;
  trackType: TrackType;
  duration: number;
  coverUrl: string | null;
  genre: string | null;
  bpm: number | null;
  playCount: number;
  // AI-Disclosure
  aiDisclosure: AiDisclosure | null;
  aiSource: string | null;
  // Voting-Stats
  auraCount: number;
  susCount: number;
  totalVotes: number;
  susPercentage: number;
  artist: {
    id: string;
    username: string;
    displayName: string | null;
  };
  streamUrl: string; // /api/tracks/[id]/stream (nur LOCAL)
  soundcloudUrl?: string | null;
  soundcloudEmbedUrl?: string | null;
}

export interface TrackAdmin extends TrackPublic {
  fileName: string | null;
  filePath: string | null;
  fileSize: number | null;
  description: string | null;
  status: string;
  sortOrder: number;
  uploaderId: string;
  createdAt: string;
  updatedAt: string;
  soundcloudArtwork?: string | null;
}

// === Player-Typen ===

export interface PlayerTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  url: string;        // Stream-URL oder Blob-URL (LOCAL) / SoundCloud-URL (SOUNDCLOUD)
  coverUrl?: string;
  isLocal: boolean;    // true = Drag&Drop, false = Server-Track
  isSoundcloud?: boolean;       // true = SoundCloud Embed Track
  soundcloudEmbedUrl?: string;  // Widget-URL für den Iframe
  aiDisclosure?: 'human' | 'ai_assisted' | 'ai_generated' | null;  // 02.05. für AI-Pill-Hook
}

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  currentTrack: PlayerTrack | null;
}

export interface PlaylistState {
  tracks: PlayerTrack[];
  currentIndex: number;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  playedTrackIds: Set<string>;
}

export interface PlayerStats {
  total: number;
  played: number;
  totalDuration: number;
}

// === Playlist-Typen ===

export interface PlaylistPublic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  type: PlaylistType;
  genre: string | null;
  isFeatured: boolean;
  trackCount: number;
  tracks?: TrackPublic[];
}

export interface PlaylistAdmin extends PlaylistPublic {
  bpmMin: number | null;
  bpmMax: number | null;
  rotationDays: number | null;
  maxTracks: number;
  isActive: boolean;
  lastRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// === Radio-Typen ===

export interface RadioNowPlaying {
  track: PlayerTrack | null;
  positionSeconds: number;
  slot: { id: string; label: string; type: 'weekly' | 'event' };
  nextTrack: PlayerTrack | null;
  slotEndsAt: string;
  serverTime: string;
  eventType?: EventType;
  streamUrl?: string;
}

export interface RadioSlotPreview {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  type: 'weekly' | 'event';
  poolName?: string;
  genre?: string;
  eventType?: EventType;
  isLive: boolean;
}

export interface PoolPublic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  genre: string | null;
  isActive: boolean;
  trackCount: number;
  totalDuration: number; // Sekunden
}

export interface PoolAdmin extends PoolPublic {
  createdAt: string;
  updatedAt: string;
  tracks?: TrackPublic[];
}

// === API-Response-Typen ===

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
