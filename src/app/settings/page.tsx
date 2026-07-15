import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import ProfileSettingsForm from './ProfileSettingsForm';
import SignOutButton from './SignOutButton';

/**
 * Profil-Einstellungsseite (v2.7 Cockpit-Redesign)
 *
 * Server-Component: Lädt aktuelles Profil, leitet nicht-eingeloggte User um.
 * ProfileSettingsForm (Client) übernimmt Bearbeitung und Speichern.
 *
 * Plus: Trust-Tier-Banner + Quick-Link zu Security-Settings (2FA + Logout-all).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.settings');
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function SettingsPage() {
  const session = await auth();
  const t = await getTranslations('settings');

  if (!session?.user?.id) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      displayName: true,
      bio: true,
      socialSoundcloud: true,
      socialInstagram: true,
      socialTelegram: true,
      socialWebsite: true,
      twitchChannel: true,
      trustTier: true,
      twoFactorEnabled: true,
      emailVerified: true,
      newsletterOptIn: true,
    },
  });

  if (!user) {
    redirect('/login');
  }

  const tierLine =
    user.trustTier === 'T2' ? t('tier.t2')
    : user.trustTier === 'T1' ? t('tier.t1')
    : t('tier.t0');

  return (
    <section
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 640 }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#3FCF4A',
            letterSpacing: '0.2em',
            margin: '0 0 10px',
          }}
        >
          {t('kicker')}
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 900,
            color: '#fff',
            lineHeight: 0.95,
            margin: '0 0 8px',
            textTransform: 'uppercase',
          }}
        >
          {t('headingLead')} <span style={{ color: '#3FCF4A', textShadow: '0 0 24px #3FCF4A' }}>{t('headingAccent')}</span>
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.6)',
            letterSpacing: '0.05em',
            margin: '0 0 24px',
          }}
        >
          {t('lead')}
        </p>

        {/* Trust-Tier-Banner */}
        <div
          className="kbk-obsidian framed"
          style={{
            padding: '12px 16px',
            marginBottom: 18,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3FCF4A', letterSpacing: '0.2em' }}>
              {t('trustTierLabel')}
            </p>
            <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
              {tierLine}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              href="/settings/security"
              style={{
                background: 'transparent',
                color: '#3FCF4A',
                border: '1px solid #3FCF4A',
                padding: '8px 14px',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 11,
                letterSpacing: '0.15em',
                textDecoration: 'none',
              }}
            >
              {t('navSecurity')}
            </Link>
            <Link
              href="/settings/connections"
              style={{
                background: 'transparent',
                color: '#9146FF',
                border: '1px solid #9146FF',
                padding: '8px 14px',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 11,
                letterSpacing: '0.15em',
                textDecoration: 'none',
              }}
            >
              {t('navConnections')}
            </Link>
            <SignOutButton />
          </div>
        </div>

        <ProfileSettingsForm initialData={user} />
      </div>
    </section>
  );
}
