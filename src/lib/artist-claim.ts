/**
 * Artist-Claim — Invite-Token-Mechanik für unclaimed ArtistProfiles (ADR-041).
 *
 * Flow legt ein Profil an + erzeugt einen Invite-Token (Klartext genau 1×
 * sichtbar, DB speichert nur den SHA-256-Hash — Muster ApiToken.tokenHash).
 * Der Künstler registriert sich normal (T1 = Email verifiziert reicht) und
 * löst den Token ein: Profil wird verknüpft, Rolle → KUENSTLER.
 *
 * Die Zustands-Checks sind pure Funktionen (testbar); die DB-Lookups leben
 * separat darunter.
 */

import { createHash, randomBytes } from 'crypto';
import prisma from '@/lib/db';

export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Token-Format: kbk_claim_<32 Bytes base64url>. Klartext nur 1× zeigen. */
export function generateClaimToken(): { token: string; tokenHash: string } {
  const token = `kbk_claim_${randomBytes(32).toString('base64url')}`;
  return { token, tokenHash: hashClaimToken(token) };
}

export type ClaimState = 'ok' | 'expired' | 'already_claimed';

/** Pure Zustands-Prüfung eines per Token gefundenen Profils. */
export function checkClaimState(
  profile: { userId: string | null; claimTokenExpiry: Date | null },
  now: Date = new Date()
): ClaimState {
  if (profile.userId) return 'already_claimed';
  if (profile.claimTokenExpiry && profile.claimTokenExpiry.getTime() < now.getTime()) {
    return 'expired';
  }
  return 'ok';
}

export interface ClaimPreview {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  claimTokenExpiry: Date | null;
}

/**
 * Sucht ein claimbares Profil per Klartext-Token (Hash-Vergleich).
 * null bei: unbekanntem Token, abgelaufenem Token, bereits geclaimtem Profil.
 * Wird von der Claim-Landing (/claim/[token]) und der Claim-API genutzt.
 */
export async function findProfileByClaimToken(token: string): Promise<ClaimPreview | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const profile = await prisma.artistProfile.findUnique({
    where: { claimTokenHash: hashClaimToken(token) },
    select: {
      id: true,
      slug: true,
      name: true,
      bio: true,
      avatarUrl: true,
      userId: true,
      claimTokenExpiry: true,
    },
  });
  if (!profile) return null;
  if (checkClaimState(profile) !== 'ok') return null;
  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    claimTokenExpiry: profile.claimTokenExpiry,
  };
}
