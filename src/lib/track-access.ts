/**
 * Zugriff auf Track-Audio und Track-Metadaten.
 *
 * Ein nicht öffentlicher Track (isPublic=false) ist Vorrat: Er wartet in einem
 * Pool oder in der Release-Queue. Hören dürfen ihn nur Admins sowie sein
 * Künstler und sein Uploader (Vorschau im Admin und im Studio).
 */

export interface TrackAccessSubject {
  isPublic: boolean;
  status: string;
  artistId: string;
  uploaderId: string;
}

export interface TrackAccessUser {
  id: string;
  role?: string | null;
}

export function canAccessTrackAudio(
  track: TrackAccessSubject,
  user: TrackAccessUser | null | undefined
): boolean {
  if (track.status === 'ARCHIVED') return false;
  if (track.isPublic) return true;
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return user.id === track.artistId || user.id === track.uploaderId;
}
