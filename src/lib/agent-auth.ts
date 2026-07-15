/**
 * Agent-Auth — Cookie-Session ODER Bearer-PAT (Phase 2, ADR-035).
 *
 * Die EINE Brücke, die bisher `auth()`-only-Routen agent-fähig macht, ohne die
 * bestehende Session-Logik anzufassen. Kill-Switch `AGENT_BRIDGE_ENABLED` (Default aus)
 * schaltet den Bearer-Pfad sofort ab — dann verhalten sich die Routen wie zuvor.
 *
 * Tokens werden NUR als SHA-256-Hash gespeichert (ApiToken.tokenHash). Ein Treffer wird
 * zusätzlich gegen revokedAt / expiresAt / userTokenVersion===User.tokenVersion geprüft,
 * damit "Logout überall" (tokenVersion++) auch alle PATs killt.
 */

import { createHash, randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { PermissionError } from '@/lib/permissions';

export interface Actor {
  userId: string;
  scopes: string[]; // z.B. ['vote']; Session-Actor bekommt ['*'] (Mensch ist voll berechtigt)
  via: 'session' | 'bearer';
}

function agentBridgeEnabled(): boolean {
  return process.env.AGENT_BRIDGE_ENABLED === 'true';
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function parseScopes(csv: string): string[] {
  return csv.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Erzeugt einen neuen PAT: Klartext (genau EINMAL zeigen) + Hash + Anzeige-Prefix. */
export function generateToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `kbk_pat_${randomBytes(32).toString('base64url')}`;
  return { token, tokenHash: sha256(token), tokenPrefix: `${token.slice(0, 16)}…` };
}

/** Hash eines gegebenen Klartext-Tokens (für Lookup/Tests). */
export function hashToken(token: string): string {
  return sha256(token);
}

/**
 * Authentifiziert einen Bearer-PAT aus dem Authorization-Header.
 * Gibt den Actor zurück oder null (kein/ungültiger Token, Kill-Switch aus, revoked/
 * expired, oder tokenVersion-Mismatch). Treffer aktualisiert lastUsedAt (fire-and-forget).
 */
export async function authenticateBearer(request: Request): Promise<Actor | null> {
  if (!agentBridgeEnabled()) return null;
  const header = request.headers.get('authorization');
  if (!header) return null;
  const m = /^Bearer\s+(kbk_pat_[A-Za-z0-9_-]+)$/.exec(header.trim());
  if (!m) return null;

  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: sha256(m[1]) },
    select: {
      id: true,
      userId: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
      userTokenVersion: true,
    },
  });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { tokenVersion: true },
  });
  if (!user || user.tokenVersion !== row.userTokenVersion) return null; // "Logout überall" killt PATs

  // fire-and-forget: lastUsedAt aktualisieren, ohne den Request zu blockieren.
  prisma.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: row.userId, scopes: parseScopes(row.scopes), via: 'bearer' };
}

/**
 * Die Brücke: NextAuth-Cookie-Session ODER Bearer-PAT. Session zuerst (Menschen im
 * Browser), dann Bearer (Agenten). Session-Actor bekommt implizit alle Scopes ('*') —
 * der eingeloggte Mensch ist voll berechtigt; Bearer-Actor nur die Token-Scopes.
 */
export async function resolveActor(request: Request): Promise<Actor | null> {
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, scopes: ['*'], via: 'session' };
  }
  return authenticateBearer(request);
}

/**
 * Wirft PermissionError, wenn der Actor fehlt oder den Scope nicht hat.
 * Session-Actor ('*') passiert immer. Analog requireTier (permissions.ts) —
 * Routen catchen PermissionError und antworten 401/403.
 */
export function requireScope(actor: Actor | null, scope: string): asserts actor is Actor {
  if (!actor) throw new PermissionError('Authentication required');
  if (actor.scopes.includes('*') || actor.scopes.includes(scope)) return;
  throw new PermissionError(`Scope required: ${scope}`);
}
