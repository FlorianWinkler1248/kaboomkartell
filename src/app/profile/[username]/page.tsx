import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { isBotUser } from '@/lib/constants';
import BoomyProfile from '@/components/profile/BoomyProfile';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import {
  IcoUser,
  IcoTrack,
  IcoChat,
  IcoSettings,
  IcoBot,
  IcoCalendar,
  IcoWave,
  IcoCam,
  IcoSend,
  IcoMap,
  IcoDiscordLogo,
} from '@/components/kbk/icons';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { SafeImg } from '@/components/ui/SafeImg';
import { cache } from 'react';

/**
 * Oeffentliche Profilseite (Cockpit-Style).
 *
 * Standard-User-Profil. Boomy bekommt Spezial-Rendering über BoomyProfile
 * (anderer Component, nicht angefasst).
 */

interface PageProps {
  params: Promise<{ username: string }>;
}

// Rolle → Akzentfarbe + Translation-Key (Label kommt aus profile.roles.*).
const roleConfig: Record<string, { roleKey: string; color: string }> = {
  ADMIN: { roleKey: 'admin', color: '#F5D02E' },
  KUENSTLER: { roleKey: 'artist', color: '#3FCF4A' },
  HELFER: { roleKey: 'helper', color: '#E63B2E' },
  MITGLIED: { roleKey: 'member', color: '#3FCF4A' },
};

/**
 * Nutzer per Benutzernamen laden — EIN Loader fuer Metadaten und Seite.
 *
 * (18.08.2026) `generateMetadata` fragte vorher drei Felder separat ab,
 * waehrend die Seite dieselbe Zeile mit allen Feldern nochmal holte. Beides
 * laeuft bei jedem Aufruf; Prisma fasst das nicht zusammen. `cache()` gilt
 * je Anfrage — Entdopplung innerhalb einer Anfrage, keine Zwischenspeicherung
 * darueber hinaus.
 */
const ladeNutzer = cache(async (username: string) =>
  prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      role: true,
      socialSoundcloud: true,
      socialInstagram: true,
      socialTelegram: true,
      socialWebsite: true,
      twitchChannel: true,
      createdAt: true,
      artistTracks: {
        where: { isPublic: true },
        // publishedAt zuerst (das ist das echte Release-Datum), createdAt als Fallback.
        // Tracks ohne publishedAt landen am Ende.
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 10,
        select: {
          title: true,
          slug: true,
          genre: true,
          trackType: true,
          coverUrl: true,
          soundcloudArtwork: true,
          publishedAt: true,
          createdAt: true,
        },
      },
      wallPosts: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          content: true,
          createdAt: true,
        },
      },
      // Verifiziertes Discord-Linking (ADR-005 F) — als Identitäts-Badge im
      // Header. Nur der Anzeigename, keine ID/Token (DSGVO Stufe 1).
      linkedAccounts: {
        where: { provider: 'discord' },
        select: { providerName: true },
      },
    },
  })
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const t = await getTranslations('meta.profile');

  const user = await ladeNutzer(username);

  if (!user) return { title: t('notFoundTitle') };

  const name = user.displayName || user.username;
  return {
    title: t('title', { name }),
    description: user.bio || t('description', { name }),
    openGraph: {
      title: t('ogTitle', { name }),
      description: user.bio || t('ogDescription', { name }),
    },
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const { username } = await params;
  const session = await auth();
  const t = await getTranslations('profile');
  const isOwnProfile = session?.user?.username === username;

  const user = await ladeNutzer(username);

  if (!user) {
    notFound();
  }

  // Boomy-Spezial-Profil — lädt sowohl Tracks wo Boomy Hauptartist ist
  // (artistTracks) als auch Tracks wo er als Featuring-Artist mitwirkt
  // (z.B. die Hardphonk-Sets, wo 4Flow Hauptartist ist + Boomy als feat.).
  // Wird in der Track-Liste gemischt + im totalTrackCount addiert.
  if (isBotUser(user.username)) {
    const [artistCount, featuringCount, featuringTracks] = await Promise.all([
      prisma.track.count({
        where: { artistId: user.id, isPublic: true },
      }),
      prisma.track.count({
        where: { featuringArtistId: user.id, isPublic: true },
      }),
      prisma.track.findMany({
        where: { featuringArtistId: user.id, isPublic: true },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 10,
        select: {
          title: true,
          slug: true,
          genre: true,
          trackType: true,
          coverUrl: true,
          soundcloudArtwork: true,
          publishedAt: true,
          createdAt: true,
          artist: { select: { username: true, displayName: true } },
        },
      }),
    ]);

    const totalTrackCount = artistCount + featuringCount;

    // Beide Listen mergen + nach publishedAt sortieren, top 10
    type BoomyTrack = (typeof user.artistTracks)[number] & {
      featuringMain?: { username: string; displayName: string | null } | null;
    };
    const merged: BoomyTrack[] = [
      ...user.artistTracks.map((t) => ({ ...t, featuringMain: null })),
      ...featuringTracks.map((t) => ({
        title: t.title,
        slug: t.slug,
        genre: t.genre,
        trackType: t.trackType,
        coverUrl: t.coverUrl,
        soundcloudArtwork: t.soundcloudArtwork,
        publishedAt: t.publishedAt,
        createdAt: t.createdAt,
        featuringMain: t.artist,
      })),
    ];
    merged.sort((a, b) => {
      const da = (a.publishedAt ?? a.createdAt).getTime();
      const db = (b.publishedAt ?? b.createdAt).getTime();
      return db - da;
    });
    const enrichedUser = { ...user, artistTracks: merged.slice(0, 10) };

    return <BoomyProfile user={enrichedUser} totalTrackCount={totalTrackCount} />;
  }

  const role = roleConfig[user.role] || roleConfig.MITGLIED;
  const roleLabel = t(`roles.${role.roleKey}`);
  const displayName = user.displayName || user.username;
  const discordHandle = user.linkedAccounts[0]?.providerName ?? null;
  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const hasSocials =
    user.socialSoundcloud ||
    user.socialInstagram ||
    user.socialTelegram ||
    user.socialWebsite ||
    user.twitchChannel;

  // Eindeutige Genres aus den Releases ableiten — gibt Profil-Header eine
  // Genre-Identität ("HARDTEK, PHONK") ohne dass User es manuell pflegen muss.
  const genreSet = new Set<string>();
  for (const t of user.artistTracks) {
    if (t.genre) genreSet.add(t.genre.toUpperCase());
  }
  const genres = Array.from(genreSet).sort();

  // Hilfs-Format für Release-Datum auf der Track-Liste.
  function relativeRelease(date: Date | null): string {
    const d = date ?? null;
    if (!d) return '';
    const diffMs = Date.now() - new Date(d).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return t('agoMinutes', { count: diffMin });
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return t('agoHours', { count: diffH });
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return t('agoDays', { count: diffD });
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return (
    <section
      style={{
        padding: '40px 24px',
        maxWidth: 760,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      {/* Header-Card */}
      <div
        className="kbk-obsidian framed"
        style={{
          ...obsidianFrameVars(role.color),
          padding: 28,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 22,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 96,
              height: 96,
              flexShrink: 0,
              background: 'rgba(0,0,0,0.4)',
              border: `2px solid ${role.color}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IcoUser size={48} style={{ color: role.color }} />
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 6,
              }}
            >
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(22px, 3.5vw, 32px)',
                  fontWeight: 900,
                  color: '#fff',
                  letterSpacing: '-0.01em',
                  margin: 0,
                  textTransform: 'uppercase',
                }}
              >
                {displayName}
              </h1>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 10,
                  letterSpacing: '0.15em',
                  padding: '3px 8px',
                  background: role.color,
                  color: '#0A0B0C',
                  fontWeight: 900,
                }}
              >
                {roleLabel}
              </span>
              {isBotUser(user.username) && (
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 10,
                    letterSpacing: '0.15em',
                    padding: '3px 8px',
                    background: '#9F6BFF',
                    color: '#0A0B0C',
                    fontWeight: 900,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <IcoBot size={11} /> {t('aiBadge')}
                </span>
              )}
              {discordHandle && (
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 10,
                    letterSpacing: '0.15em',
                    padding: '3px 8px',
                    background: '#5865F2',
                    color: '#fff',
                    fontWeight: 900,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title={t('discordVerifiedTitle')}
                >
                  <IcoDiscordLogo size={11} /> {discordHandle.toUpperCase()}
                </span>
              )}
            </div>

            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'rgba(255,255,255,0.5)',
                letterSpacing: '0.05em',
                margin: '0 0 14px',
              }}
            >
              @{user.username}
            </p>

            {/* Genre-Tags aus den Releases (autom. abgeleitet, kein Profil-Field) */}
            {genres.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 14px' }}>
                {genres.map((g) => (
                  <span
                    key={g}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: '#fff',
                      letterSpacing: '0.18em',
                      padding: '2px 8px',
                      border: `1px solid ${role.color}55`,
                      background: `${role.color}15`,
                      fontWeight: 700,
                    }}
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {user.bio && (
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.78)',
                  lineHeight: 1.6,
                  margin: '0 0 14px',
                }}
              >
                {user.bio}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'rgba(255,255,255,0.5)',
                letterSpacing: '0.1em',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <IcoCalendar size={11} /> {t('memberSince', { date: memberSince.toUpperCase() })}
              </span>
              {user.wallPosts.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <IcoChat size={11} /> {t('postCount', { count: user.wallPosts.length })}
                </span>
              )}
            </div>

            {/* Edit-Button (nur eigenes Profil) */}
            {isOwnProfile && (
              <Link
                href="/settings"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 18,
                  padding: '10px 18px',
                  minHeight: 44,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textDecoration: 'none',
                }}
              >
                <IcoSettings size={14} /> {t('editProfile')}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Social Links */}
      {hasSocials && (
        <div style={{ marginBottom: 18 }}>
          <SectionTitle sub="S" label={t('links.label')} title={t('links.title')} accent="yellow" />
          <div
            className="kbk-subpage-grid-2"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginTop: 18,
            }}
          >
            {user.socialSoundcloud && (
              <SocialLink
                href={user.socialSoundcloud}
                label="SOUNDCLOUD"
                value={user.socialSoundcloud.replace(/^https?:\/\/(www\.)?/, '')}
                color="#E63B2E"
                Icon={IcoWave}
              />
            )}
            {user.socialInstagram && (
              <SocialLink
                href={user.socialInstagram}
                label="INSTAGRAM"
                value={user.socialInstagram.replace(/^https?:\/\/(www\.)?/, '')}
                color="#F5D02E"
                Icon={IcoCam}
              />
            )}
            {user.socialTelegram && (
              <SocialLink
                href={
                  user.socialTelegram.startsWith('http')
                    ? user.socialTelegram
                    : `https://t.me/${user.socialTelegram.replace('@', '')}`
                }
                label="TELEGRAM"
                value={user.socialTelegram}
                color="#3FCF4A"
                Icon={IcoSend}
              />
            )}
            {user.socialWebsite && (
              <SocialLink
                href={user.socialWebsite}
                label="WEBSITE"
                value={user.socialWebsite.replace(/^https?:\/\/(www\.)?/, '')}
                color="#3FCF4A"
                Icon={IcoMap}
              />
            )}
            {user.twitchChannel && (
              <SocialLink
                href={`https://www.twitch.tv/${user.twitchChannel}`}
                label="TWITCH"
                value={`twitch.tv/${user.twitchChannel}`}
                color="#9146FF"
                Icon={IcoSend}
              />
            )}
          </div>
        </div>
      )}

      {/* Releases (vorher "TRACKS" — Flow's Vorgabe 30.04.2026: pro Artist eine
          chronologische Releases-Liste, gleicher Maßstab wie auf Home). */}
      {user.artistTracks.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionTitle sub="R" label={t('releases.label')} title={t('releases.title')} accent="green" />
          <div
            className="kbk-obsidian framed"
            style={{
              marginTop: 18,
            }}
          >
            {user.artistTracks.map((track) => (
              <Link
                key={track.slug}
                href={`/tracks/${track.slug}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  textDecoration: 'none',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(63,207,74,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <SafeImg
                    src={track.coverUrl || track.soundcloudArtwork}
                    alt={track.title}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    fallback={<IcoTrack size={18} style={{ opacity: 0.6 }} />}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 13,
                      fontWeight: 900,
                      color: '#fff',
                      letterSpacing: '0.02em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {track.title}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      marginTop: 3,
                    }}
                  >
                    {track.genre && (
                      <span style={{ color: 'rgba(255,255,255,0.65)' }}>
                        {track.genre.toUpperCase()}
                      </span>
                    )}
                    {(track.publishedAt || track.createdAt) && (
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                        · {relativeRelease(track.publishedAt ?? track.createdAt)}
                      </span>
                    )}
                  </div>
                </div>
                {track.trackType === 'SOUNDCLOUD' && (
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 10,
                      letterSpacing: '0.15em',
                      padding: '3px 6px',
                      background: '#E63B2E',
                      color: '#0A0B0C',
                      fontWeight: 900,
                    }}
                  >
                    SC
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Posts */}
      {user.wallPosts.length > 0 && (
        <div>
          <SectionTitle sub="P" label={t('posts.label')} title={t('posts.title')} accent="red" />
          <div
            className="kbk-obsidian framed kbk-frame-red"
            style={{
              padding: 18,
              marginTop: 18,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {user.wallPosts.map((post) => (
                <div
                  key={post.id}
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    padding: '12px 14px',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.85)',
                      lineHeight: 1.6,
                      margin: 0,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {post.content}
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.4)',
                      letterSpacing: '0.1em',
                      margin: '8px 0 0',
                    }}
                  >
                    {new Date(post.createdAt)
                      .toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                      .toUpperCase()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// === SocialLink Helper ===
interface SocialLinkProps {
  href: string;
  label: string;
  value: string;
  color: string;
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}

function SocialLink({ href, label, value, color, Icon }: SocialLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="kbk-obsidian framed"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        ...obsidianFrameVars(color),
        textDecoration: 'none',
        minHeight: 56,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          flexShrink: 0,
          background: 'rgba(0,0,0,0.4)',
          border: `1px solid ${color}60`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={18} style={{ color }} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 11,
            fontWeight: 900,
            color,
            letterSpacing: '0.15em',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '0.05em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </div>
      </div>
    </a>
  );
}
