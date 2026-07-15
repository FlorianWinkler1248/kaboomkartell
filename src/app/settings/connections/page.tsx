import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import ConnectionsClient from './ConnectionsClient';

/**
 * /settings/connections (ADR-005 Sektion F)
 *
 * Verlinkte Twitch/Discord-Identities verwalten. KBK-Master-Account bleibt
 * Email/Password — externe Plattformen sind nur Verbindungen, kein Login.
 *
 * `*Configured` = sind die OAuth-Credentials in der Server-.env gesetzt?
 * Wenn nicht, zeigt die Karte graceful "Coming Soon" statt eines toten Buttons.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.settings');
  return {
    title: t('connectionsTitle'),
    description: t('connectionsDescription'),
  };
}

export default async function ConnectionsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/settings/connections');
  }

  const linked = await prisma.linkedAccount.findMany({
    where: { userId: session.user.id },
    select: {
      provider: true,
      providerName: true,
      linkedAt: true,
    },
  });

  const twitchConfigured = Boolean(process.env.TWITCH_CLIENT_ID);
  const discordConfigured = Boolean(process.env.DISCORD_CLIENT_ID);

  const twitchLink = linked.find((l) => l.provider === 'twitch') ?? null;
  const discordLink = linked.find((l) => l.provider === 'discord') ?? null;

  return (
    <ConnectionsClient
      twitch={
        twitchLink && {
          providerName: twitchLink.providerName,
          linkedAt: twitchLink.linkedAt.toISOString(),
        }
      }
      twitchConfigured={twitchConfigured}
      discord={
        discordLink && {
          providerName: discordLink.providerName,
          linkedAt: discordLink.linkedAt.toISOString(),
        }
      }
      discordConfigured={discordConfigured}
    />
  );
}
