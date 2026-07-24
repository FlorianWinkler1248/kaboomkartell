/**
 * RecentReleasesSection — „LAST RELEASED" Liste auf der Homepage.
 *
 * Server Component (async). Zeigt die letzten 5 PUBLISHED Tracks sortiert nach
 * publishedAt (desc, fallback createdAt). Jeder Eintrag zeigt Cover + Titel +
 * Artist + Genre-Tag + Release-Datum. Klick führt auf die Track-Detail-Page.
 *
 * Hintergrund (Flow's Brief 30.04.2026): Boomy released täglich — das war auf
 * der Homepage bisher nicht sichtbar, also war auch nicht klar, dass das System
 * läuft. Diese Box macht Releases für Erstbesucher sofort sichtbar und dient
 * später als Vorlage für die Releases-Liste in Artist-Profiles.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import { Music2 } from 'lucide-react';
import { formatArtistDisplay } from '@/lib/track-display';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { SafeImg } from '@/components/ui/SafeImg';

// next-intl-Translator-Typ für den Relative-Time-Helper (home.recent-Namespace).
type RecentT = Awaited<ReturnType<typeof getTranslations<'home.recent'>>>;

const GREEN = '#3FCF4A';
const RED = '#E63B2E';
const YELLOW = '#F5D02E';

function colorForGenre(genre: string | null | undefined): string {
  const g = (genre ?? '').toUpperCase();
  if (g.includes('HARDTEK') || g.includes('FRENCHCORE')) return YELLOW;
  if (g.includes('RAGGA')) return GREEN;
  if (g.includes('PHONK')) return RED;
  return GREEN;
}

function formatRelease(date: Date | null, t: RecentT): string {
  if (!date) return '—';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return t('agoMinutes', { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('agoHours', { count: diffH });
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return t('agoDays', { count: diffD });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function RecentReleasesSection() {
  // Translator heißt hier `tr`, weil die Track-Map unten `t` als Loop-Variable nutzt.
  const tr = await getTranslations('home.recent');

  let tracks: Array<{
    id: string;
    title: string;
    slug: string;
    coverUrl: string | null;
    soundcloudArtwork: string | null;
    genre: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    artistId: string;
    artist: { username: string; displayName: string | null };
    featuringArtist: { username: string; displayName: string | null } | null;
  }> = [];

  try {
    // „Latest from each artist" — wir holen mehr Tracks als nötig und filtern
    // dann pro Artist auf den jüngsten. Garantiert dass Boomy + 4Flow + andere
    // Artists alle in der Box sichtbar sind (Flows Vorgabe 30.04.2026: Boomy
    // soll prominent zu sehen sein, nicht von 4Flow's Mass-Releases verdraengt
    // werden).
    const candidates = await prisma.track.findMany({
      where: { isPublic: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 80,
      select: {
        id: true,
        title: true,
        slug: true,
        coverUrl: true,
        soundcloudArtwork: true,
        genre: true,
        publishedAt: true,
        createdAt: true,
        artistId: true,
        artist: { select: { username: true, displayName: true } },
        featuringArtist: { select: { username: true, displayName: true } },
        // ADR-041: Profil-Name externer Künstler (formatArtistDisplay-Priorität)
        artistProfile: { select: { name: true } },
      },
    });

    const seen = new Set<string>();
    const latest: typeof candidates = [];
    for (const t of candidates) {
      if (seen.has(t.artistId)) continue;
      seen.add(t.artistId);
      latest.push(t);
      if (latest.length >= 5) break;
    }
    tracks = latest;
  } catch (err) {
    console.error('RecentReleasesSection query failed:', err);
    tracks = [];
  }

  return (
    <div className="kbk-page-section" style={{ padding: '20px 24px' }}>
      <SectionTitle sub="05" label={tr('sectionLabel')} title={tr('sectionTitle')} accent="yellow" />
      {tracks.length === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.4)',
            marginTop: 20,
            letterSpacing: '0.1em',
          }}
        >
          {tr('empty')}
        </p>
      ) : (
        <div
          style={{
            marginTop: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          {tracks.map((t) => {
            const cover = t.coverUrl || t.soundcloudArtwork || null;
            const accent = colorForGenre(t.genre);
            const artistName = formatArtistDisplay(t);
            const released = t.publishedAt ?? t.createdAt;
            return (
              <Link
                key={t.id}
                prefetch={false}
                href={`/tracks/${t.slug}`}
                className="kbk-obsidian framed kbk-recent-release"
                style={{
                  ...obsidianFrameVars(accent),
                  padding: 12,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    flexShrink: 0,
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${accent}33`,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <SafeImg
                    src={cover}
                    alt={t.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    fallback={
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: accent,
                        }}
                      >
                        <Music2 size={24} />
                      </div>
                    }
                  />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 14,
                      fontWeight: 900,
                      color: '#fff',
                      letterSpacing: '0.01em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={t.title}
                  >
                    {t.title}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.6)',
                      marginTop: 2,
                      letterSpacing: '0.08em',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={artistName}
                  >
                    {artistName}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginTop: 6,
                      alignItems: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      letterSpacing: '0.12em',
                    }}
                  >
                    {t.genre && (
                      <span
                        style={{
                          color: accent,
                          border: `1px solid ${accent}55`,
                          padding: '1px 6px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {t.genre}
                      </span>
                    )}
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>{formatRelease(released, tr)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
