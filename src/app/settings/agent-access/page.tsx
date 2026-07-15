import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { TIER_ORDER, type TrustTier } from '@/lib/badges';
import AgentAccessClient from './AgentAccessClient';

/**
 * /settings/agent-access (P2.4 / ADR-035)
 *
 * Der Mensch verwaltet hier seine Agenten-Tokens (PATs): erstellen, ansehen, widerrufen.
 * Der Klartext eines neuen Tokens erscheint GENAU EINMAL in einer Copy-Box — danach ist
 * nur der Hash bekannt. Erstellen ist ein T1-Recht (Email verifiziert).
 *
 * UI-Sprache Englisch (KBK-Konvention). Muster: /settings/connections.
 */

export const metadata: Metadata = {
  title: 'Agent Access — KaboomKartell',
  description: 'Personal access tokens that let your AI agent act on KaboomKartell for you.',
};

export default async function AgentAccessPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/settings/agent-access');
  }

  const [tokens, user] = await Promise.all([
    prisma.apiToken.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { trustTier: true } }),
  ]);

  const tier = (user?.trustTier as TrustTier) ?? 'T0';
  const canCreate = (TIER_ORDER[tier] ?? 0) >= TIER_ORDER.T1;

  return (
    <AgentAccessClient
      canCreate={canCreate}
      initialTokens={tokens.map((t) => ({
        id: t.id,
        name: t.name,
        tokenPrefix: t.tokenPrefix,
        scopes: t.scopes,
        lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
        revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  );
}
