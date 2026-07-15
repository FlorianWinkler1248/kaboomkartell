import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import AgentAuthorizeClient from './AgentAuthorizeClient';

/**
 * /agent/authorize (P2.5 / ADR-035) — DER eine menschliche Klick der Traffic-Strategie.
 *
 * Der Mensch tippt den vom Agenten genannten Code ein, sieht die Scopes und bestätigt.
 * Erst dann bekommt der Agent seinen PAT. Login erforderlich (redirect mit callbackUrl).
 */

export const metadata: Metadata = {
  title: 'Authorize an agent — KaboomKartell',
  description: 'Let your AI agent act on KaboomKartell for you.',
};

export default async function AgentAuthorizePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/agent/authorize');
  }
  return <AgentAuthorizeClient />;
}
