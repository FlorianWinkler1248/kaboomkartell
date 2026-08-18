/**
 * Öffentliche Artist-Seite /artists/[slug] (ADR-041 Welle 3)
 *
 * Server-Component im Cockpit-Stil (kbk-obsidian framed, Muster
 * playlists/[slug] + artists/page.tsx): Header (Banner/Avatar/Name/Bio),
 * Social-Link-Buttons (nur gesetzte), Discography mit LOCAL-Tracks als
 * Liste (Link auf /tracks/[slug]) + SOUNDCLOUD-Tracks als Embed-Karten
 * (Client-Wrapper, nur ein Embed offen). i18n ×4 via 'artistsPublic'.
 * Geclaimte vs. unclaimed Profile rendern identisch (v1).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { formatTime } from '@/lib/utils';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { SafeImg } from '@/components/ui/SafeImg';
import ArtistSoundcloudList, { type ScTrackItem } from './ArtistSoundcloudList';
import { cache } from 'react';

// Live aus der DB rendern — Profil-Edits im Studio sollen sofort sichtbar sein
export const dynamic = 'force-dynamic';

const GREEN = '#3FCF4A';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// (18.08.2026) `cache()` ergaenzt: Die Funktion war bereits zwischen
// `generateMetadata` und der Seite geteilt, lief aber trotzdem zweimal je
// Aufruf — geteilter Code allein entdoppelt keine Datenbank-Abfragen.
// Gilt je Anfrage, ist also keine Zwischenspeicherung ueber Aufrufe hinweg.
const loadProfile = cache(async (slug: string) => {
  const profile = await prisma.artistProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      bio: true,
      avatarUrl: true,
      headerUrl: true,
      socialSoundcloud: true,
      socialInstagram: true,
      socialTelegram: true,
      socialWebsite: true,
      isPublished: true,
    },
  });
  // Unveröffentlichte Profile sind öffentlich unsichtbar
  if (!profile || !profile.isPublished) return null;
  return profile;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  const t = await getTranslations('artistsPublic');

  if (!profile) return { title: t('notFound') };

  return {
    title: `${profile.name} — KaboomKartell`,
    description: profile.bio ?? undefined,
    openGraph: {
      title: `${profile.name} — KaboomKartell`,
      ...(profile.bio && { description: profile.bio }),
      ...(profile.avatarUrl && { images: [{ url: profile.avatarUrl }] }),
    },
  };
}

function SectionHeader({ label, color = GREEN }: { label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 16 }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color,
          letterSpacing: '0.2em',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}40, transparent)` }} />
    </div>
  );
}

export default async function PublicArtistPage({ params }: PageProps) {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  if (!profile) notFound();

  const t = await getTranslations('artistsPublic');

  const tracks = await prisma.track.findMany({
    where: { artistProfileId: profile.id, isPublic: true },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      slug: true,
      trackType: true,
      duration: true,
      coverUrl: true,
      genre: true,
      soundcloudUrl: true,
      soundcloudEmbedUrl: true,
    },
  });

  const localTracks = tracks.filter((track) => track.trackType === 'LOCAL');
  const scTracks: ScTrackItem[] = tracks
    .filter((track) => track.trackType === 'SOUNDCLOUD' && track.soundcloudEmbedUrl)
    .map((track) => ({
      id: track.id,
      title: track.title,
      embedUrl: track.soundcloudEmbedUrl as string,
      soundcloudUrl: track.soundcloudUrl ?? undefined,
      artworkUrl: track.coverUrl,
    }));

  // Nur gesetzte Social-Links rendern — Plattform-Namen sind Markenbegriffe
  const socialLinks = [
    { label: 'SoundCloud', url: profile.socialSoundcloud },
    { label: 'Instagram', url: profile.socialInstagram },
    { label: 'Telegram', url: profile.socialTelegram },
    { label: 'Website', url: profile.socialWebsite },
  ].filter((link): link is { label: string; url: string } => !!link.url);

  return (
    <main style={{ padding: '40px 24px', maxWidth: 880, marginInline: 'auto' }}>
      {/* ===== Header-Karte: Banner + Avatar + Name + Bio ===== */}
      <section
        className="kbk-obsidian framed"
        style={{ ...obsidianFrameVars(GREEN), padding: 0, overflow: 'hidden', marginBottom: 28 }}
      >
        {profile.headerUrl && (
          <div style={{ width: '100%', height: 180, overflow: 'hidden' }}>
            <SafeImg
              src={profile.headerUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              fallback={<div style={{ width: '100%', height: '100%' }} />}
            />
          </div>
        )}
        <div style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 88,
                height: 88,
                flexShrink: 0,
                borderRadius: '50%',
                overflow: 'hidden',
                border: `2px solid ${GREEN}66`,
                background: 'rgba(255,255,255,0.06)',
                marginTop: profile.headerUrl ? -56 : 0,
                boxShadow: '0 4px 18px rgba(0,0,0,0.6)',
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
                      fontSize: 34,
                      fontWeight: 900,
                      color: GREEN,
                    }}
                  >
                    {profile.name.charAt(0).toUpperCase()}
                  </div>
                }
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: GREEN,
                  letterSpacing: '0.25em',
                  margin: '0 0 8px',
                }}
              >
                {t('extendedFamilyKicker')}
              </p>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(30px, 6vw, 48px)',
                  fontWeight: 900,
                  lineHeight: 0.95,
                  color: '#fff',
                  margin: 0,
                  textTransform: 'uppercase',
                  wordBreak: 'break-word',
                }}
              >
                {profile.name}
              </h1>
            </div>
          </div>

          {profile.bio && (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'rgba(255,255,255,0.78)',
                lineHeight: 1.7,
                margin: '18px 0 0',
                whiteSpace: 'pre-wrap',
              }}
            >
              {profile.bio}
            </p>
          )}
        </div>
      </section>

      {/* ===== Social-Links (nur gesetzte) ===== */}
      {socialLinks.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <SectionHeader label={t('links')} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="kbk-obsidian polished"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 44,
                  padding: '10px 18px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: GREEN,
                  textDecoration: 'none',
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ===== Discography ===== */}
      <SectionHeader label={t('discography')} />

      {/* LOCAL-Tracks — Liste mit Link auf die Track-Detail-Seite */}
      {localTracks.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.2em',
              margin: '0 0 12px',
            }}
          >
            {t('onKbk')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {localTracks.map((track) => (
              <Link
                key={track.id}
                href={`/tracks/${track.slug}`}
                className="kbk-obsidian polished"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '10px 14px',
                  minHeight: 56,
                  textDecoration: 'none',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    overflow: 'hidden',
                    borderRadius: 4,
                    background: 'rgba(255,255,255,0.06)',
                  }}
                >
                  <SafeImg
                    src={track.coverUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    fallback={<div style={{ width: '100%', height: '100%' }} />}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 14,
                      fontWeight: 900,
                      color: '#fff',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {track.title}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.55)',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {track.genre}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.55)',
                    flexShrink: 0,
                  }}
                >
                  {formatTime(track.duration)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* SOUNDCLOUD-Tracks — Embed-Karten (Client-Wrapper, nur eins offen) */}
      {scTracks.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.2em',
              margin: '0 0 12px',
            }}
          >
            {t('fromSoundcloud')}
          </p>
          <ArtistSoundcloudList tracks={scTracks} />
        </section>
      )}

      {localTracks.length === 0 && scTracks.length === 0 && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.5)',
            margin: 0,
          }}
        >
          —
        </p>
      )}
    </main>
  );
}
