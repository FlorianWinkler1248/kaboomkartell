/**
 * Permission-Helper (v2.27, ADR-005 Phase 1) — Server-side.
 *
 * Zwei orthogonale Achsen:
 *   - Rolle (User.role): MITGLIED / KUENSTLER / HELFER / ADMIN
 *   - Badges (Badge[]): mod:community / artist:upload / verified / ...
 *
 * ADMIN-Rolle hat implizit alle Badges. requireBadge/hasBadge geben
 * dann immer true zurück, unabhängig vom Badge-Eintrag.
 *
 * Trust-Tier (User.trustTier): T0 < T1 < T2. requireTier ist linearer
 * Vergleich, kein Override durch Badges in dieser Phase.
 *
 * Phase-1-Scope (heute): hasBadge / requireBadge / requireTier + Konstanten.
 * Tier-Gates an existing Endpoints, Rate-Limit-Matrix, Discord/Twitch sind
 * Folge-Sessions (siehe ADR-005 Sektion B/C/D/E).
 *
 * **Client-Code** importiert Konstanten + Types nur aus `@/lib/badges`,
 * nicht aus dieser Datei (prisma-Import würde Client-Bundle brechen).
 */

import prisma from '@/lib/db';
import {
  BADGES,
  BADGE_TYPES_LIST,
  TIER_ORDER,
  isKnownBadgeType,
  type BadgeType,
  type TrustTier,
} from '@/lib/badges';

// Re-Export der Client-safe Konstanten — für Server-Code, der bereits
// `from '@/lib/permissions'` importiert hat.
export { BADGES, BADGE_TYPES_LIST, isKnownBadgeType, type BadgeType, type TrustTier };

/** ADMIN-Bypass + DB-Lookup. Bot-Sentinel: User mit Badge 'bot' wird auch
 *  als Bot erkannt (BOT_USERNAMES bleibt bestehen, Badge ist die zweite Quelle). */
export async function hasBadge(userId: string, type: BadgeType): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return false;
  if (user.role === 'ADMIN') return true;

  const badge = await prisma.badge.findUnique({
    where: { userId_type: { userId, type } },
    select: { id: true },
  });
  return badge !== null;
}

/** PermissionError — von API-Routes catchen + 403 zurückgeben. */
export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

export async function requireBadge(userId: string, type: BadgeType): Promise<void> {
  if (!(await hasBadge(userId, type))) {
    throw new PermissionError(`Badge required: ${type}`);
  }
}

export async function requireTier(userId: string, minTier: TrustTier): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustTier: true },
  });
  if (!user) throw new PermissionError('User not found');
  const userLevel = TIER_ORDER[user.trustTier as TrustTier] ?? 0;
  if (userLevel < TIER_ORDER[minTier]) {
    throw new PermissionError(
      `Trust tier ${minTier} required (current: ${user.trustTier})`
    );
  }
}

/**
 * ADR-041: Das Upload-Recht ist eine Komposition — Badge `artist:upload`
 * UND Trust-Tier T2 (2FA). Die EINE Stelle, an der die Upload-Policy lebt;
 * verdrahtet in /api/upload (Audio-Zweig) + /api/studio/tracks. ADMIN
 * passiert beide Checks implizit (hasBadge-Bypass; ADMIN-Konten sind T2).
 */
export async function requireUploadRight(userId: string): Promise<void> {
  // ADMIN-Bypass komplett (auch fürs Tier — Flow-Konten gelten als vertraut).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === 'ADMIN') return;
  await requireBadge(userId, BADGES.ARTIST_UPLOAD);
  await requireTier(userId, 'T2');
}

/**
 * Sync-Variante für User-Objects mit eager-loaded badges (Performance).
 * Nutze diese in Hot-Pfaden wo der User-State sowieso schon geladen ist
 * (z.B. Server-Components mit Session-User).
 */
export function userHasBadge(
  user: { role: string; badges?: { type: string }[] },
  type: BadgeType
): boolean {
  if (user.role === 'ADMIN') return true;
  return (user.badges ?? []).some((b) => b.type === type);
}
