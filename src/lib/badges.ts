/**
 * Badge-Konstanten + Type-Definitionen (v2.27, ADR-005 Phase 1).
 *
 * Client-safe: KEIN Server-Only-Modul-Import (kein prisma, kein node:module).
 * Wird sowohl von Client-Components (Admin-UI Badge-Modal) als auch von
 * Server-Routes (Permission-Helper) genutzt.
 *
 * Permission-Logic (hasBadge/requireBadge/requireTier) lebt in
 * `lib/permissions.ts` und re-exported diese Konstanten — Server-Code darf
 * weiter aus `lib/permissions` importieren wenn es DB-Zugriff braucht.
 */

export const BADGES = {
  MOD_COMMUNITY: 'mod:community',
  MOD_TRACKS: 'mod:tracks',
  MOD_TIMETABLE: 'mod:timetable',
  MOD_EVENTS: 'mod:events',
  ARTIST_UPLOAD: 'artist:upload',
  ARTIST_FEATURED: 'artist:featured',
  GUEST_STREAMER: 'guest:streamer',
  VERIFIED: 'verified',
  BOT: 'bot',
} as const;

export type BadgeType = (typeof BADGES)[keyof typeof BADGES];

export const BADGE_TYPES_LIST: BadgeType[] = Object.values(BADGES);

export const TIER_ORDER = { T0: 0, T1: 1, T2: 2 } as const;
export type TrustTier = keyof typeof TIER_ORDER;

/**
 * Type-Guard: validiert ob ein freier String ein bekannter Badge-Type
 * ist. Schuetzt API-Endpoint vor Aufruf mit unbekanntem Badge.
 */
export function isKnownBadgeType(type: string): type is BadgeType {
  return BADGE_TYPES_LIST.includes(type as BadgeType);
}
