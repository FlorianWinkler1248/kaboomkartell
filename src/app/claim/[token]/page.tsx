/**
 * Claim-Landing /claim/[token] (ADR-041)
 *
 * BEWUSST top-level statt unter /studio: das Studio-Layout-Gate würde
 * anonyme Besucher (die den Invite-Link von Flow bekommen haben) sofort
 * wegwerfen. Server-Component: Token-Lookup via findProfileByClaimToken
 * (null bei unbekannt/abgelaufen/schon geclaimt) → Profil-Vorschau +
 * Claim-Button (Client-Child). Seite ist EN-only (Studio-Konvention).
 */

import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { findProfileByClaimToken } from '@/lib/artist-claim';
import { SafeImg } from '@/components/ui/SafeImg';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import ClaimActions from './ClaimActions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Claim your artist spot — KaboomKartell',
  robots: { index: false, follow: false },
};

const GREEN = '#3FCF4A';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ClaimLandingPage({ params }: PageProps) {
  const { token } = await params;
  const [session, profile] = await Promise.all([auth(), findProfileByClaimToken(token)]);

  return (
    <main style={{ padding: '48px 24px', maxWidth: 620, marginInline: 'auto' }}>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: GREEN,
          letterSpacing: '0.25em',
          margin: '0 0 16px',
        }}
      >
        /INVITE/ ARTIST CLAIM
      </p>

      {!profile ? (
        /* Ungültiger / abgelaufener / bereits eingelöster Token */
        <section
          className="kbk-obsidian framed kbk-frame-red"
          style={{ padding: 28 }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(24px, 5vw, 34px)',
              fontWeight: 900,
              color: '#fff',
              margin: '0 0 12px',
              textTransform: 'uppercase',
            }}
          >
            Invalid or expired link
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'rgba(255,255,255,0.78)',
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            This invite link is not valid anymore — it may have expired or the
            artist spot was already claimed. If you think this is a mistake,
            reach out to Flow and ask for a fresh invite.
          </p>
        </section>
      ) : (
        <section
          className="kbk-obsidian framed"
          style={{ ...obsidianFrameVars(GREEN), padding: 28 }}
        >
          {/* Profil-Vorschau: Avatar + Name groß + Bio */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 18 }}>
            <div
              style={{
                width: 72,
                height: 72,
                flexShrink: 0,
                borderRadius: '50%',
                overflow: 'hidden',
                border: `2px solid ${GREEN}66`,
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              <SafeImg
                src={profile.avatarUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                fallback={
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-display)',
                      fontSize: 28,
                      fontWeight: 900,
                      color: GREEN,
                    }}
                  >
                    {profile.name.charAt(0).toUpperCase()}
                  </div>
                }
              />
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(28px, 6vw, 42px)',
                fontWeight: 900,
                lineHeight: 1,
                color: '#fff',
                margin: 0,
                textTransform: 'uppercase',
                wordBreak: 'break-word',
              }}
            >
              {profile.name}
            </h1>
          </div>

          {profile.bio && (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'rgba(255,255,255,0.78)',
                lineHeight: 1.7,
                margin: '0 0 18px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {profile.bio}
            </p>
          )}

          {/* Erklärtext */}
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'rgba(255,255,255,0.78)',
              lineHeight: 1.7,
              margin: '0 0 22px',
            }}
          >
            Flow set this artist spot up for you. Claim it to take over your
            public artist page, manage your profile and submit tracks through
            the studio — every drop still goes through Flow&apos;s review
            before it hits the radio.
          </p>

          <ClaimActions token={token} isLoggedIn={!!session?.user} />

          {!session?.user && (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'rgba(255,255,255,0.5)',
                lineHeight: 1.6,
                margin: '14px 0 0',
              }}
            >
              You need a verified account to claim — after logging in you land
              right back here.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
