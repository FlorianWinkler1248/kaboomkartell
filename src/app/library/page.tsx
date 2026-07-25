import DanceSprite from '@/components/kbk/DanceSprite';
import prisma from '@/lib/db'
import { formatTime } from '@/lib/utils'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import type { Prisma } from '@/generated/prisma/client'
import { SectionTitle } from '@/components/kbk/SectionTitle'
import {
  IcoTrack,
  IcoWave,
} from '@/components/kbk/icons'
import LibraryFilters from './LibraryFilters'
import { SafeImg } from '@/components/ui/SafeImg'
import { LibraryQueue, LibraryRowPlay, LibraryPlayAll } from './LibraryPlay'
import { formatArtistDisplay } from '@/lib/track-display'
import type { PlayerTrack } from '@/types'

// next-intl-Translator-Typ für die Pagination-Sub-Component (library-Namespace).
type LibraryT = Awaited<ReturnType<typeof getTranslations<'library'>>>;

/**
 * Oeffentliche Song-Bibliothek — /library.
 *
 * v2.24 (03.05.2026): Pagination + Filter + Sort. Alles SSR via
 * searchParams — bookmarkbar, share-bar, kein client-state. Filter-UI ist
 * eine kleine Client-Component (instant URL-update via router.push).
 *
 * URL-Schema:
 *   /library?page=2&sort=alphabetical&genre=phonk&pool=hardphonk-sessions&artist=4flow
 *
 * Pagination: 25 Tracks pro Page.
 */

// force-dynamic: Library liest Tracks live aus der DB.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.library');
  return {
    title: t('title'),
    description: t('description'),
  };
}

const PAGE_SIZE = 25;

// Genre → Akzentfarbe (Hex). Default = Venom-Green.
function genreColor(genre: string | null): string {
  if (!genre) return '#3FCF4A'
  const g = genre.toLowerCase()
  if (g.includes('phonk')) return '#E63B2E'
  if (g.includes('hardtek') || g.includes('frenchcore')) return '#F5D02E'
  return '#3FCF4A'
}

type SortKey = 'newest' | 'oldest' | 'alphabetical' | 'plays';

function parseSort(s: string | undefined): SortKey {
  if (s === 'oldest' || s === 'alphabetical' || s === 'plays') return s;
  return 'newest';
}

function buildOrderBy(sort: SortKey): Prisma.TrackOrderByWithRelationInput {
  switch (sort) {
    case 'oldest':
      // Tracks ohne publishedAt ans Ende, sonst alt nach jung asc
      return { publishedAt: { sort: 'asc', nulls: 'last' } };
    case 'alphabetical':
      return { title: 'asc' };
    case 'plays':
      return { playCount: 'desc' };
    case 'newest':
    default:
      return { publishedAt: { sort: 'desc', nulls: 'last' } };
  }
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const t = await getTranslations('library');
  const params = await searchParams;
  const pickStr = (key: string): string => {
    const v = params[key];
    if (Array.isArray(v)) return v[0] ?? '';
    return v ?? '';
  };

  const page = Math.max(1, parseInt(pickStr('page') || '1', 10) || 1);
  const sort = parseSort(pickStr('sort'));
  const genre = pickStr('genre');
  const poolSlug = pickStr('pool');
  const artistUsername = pickStr('artist');

  // Where-Clause aus Filter-Params bauen
  const where: Prisma.TrackWhereInput = {
    isPublic: true,
    ...(genre && { genre: { equals: genre } }),
    ...(artistUsername && {
      OR: [
        { artist: { username: artistUsername } },
        { featuringArtist: { username: artistUsername } },
      ],
    }),
    ...(poolSlug && {
      poolTracks: { some: { pool: { slug: poolSlug } } },
    }),
  };

  // Filter-Optionen + Tracks parallel laden
  const [tracks, totalCount, genreGroups, allPools, allArtists] = await Promise.all([
    prisma.track.findMany({
      where,
      include: {
        artist: { select: { username: true, displayName: true } },
        featuringArtist: { select: { username: true, displayName: true } },
        // ADR-041: Profil-Name externer Künstler (Anzeige-Priorität)
        artistProfile: { select: { name: true } },
      },
      orderBy: buildOrderBy(sort),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.track.count({ where }),
    // Genres mit Track-Anzahl (nur öffentliche)
    prisma.track.groupBy({
      by: ['genre'],
      where: { isPublic: true, genre: { not: null } },
      _count: { _all: true },
    }),
    // Alle aktiven Pools mit Track-Anzahl
    prisma.pool.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { tracks: { where: { track: { isPublic: true } } } } },
      },
      orderBy: { name: 'asc' },
    }),
    // Alle User mit mindestens 1 öffentlichem Track (entweder als Artist oder Featuring)
    prisma.user.findMany({
      where: {
        OR: [
          { artistTracks: { some: { isPublic: true } } },
          { featuringTracks: { some: { isPublic: true } } },
        ],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        _count: { select: { artistTracks: { where: { isPublic: true } } } },
      },
      orderBy: { username: 'asc' },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasActiveFilters = !!(genre || poolSlug || artistUsername || sort !== 'newest');

  // Direkte Wiedergabe (ADR-041-Nachschlag): Queue = die sichtbaren LOCAL-
  // Tracks dieser Seite, EINMAL serialisiert (LibraryQueue-Context). SC-Tracks
  // spielen weiter über die Detail-Seite (Embed braucht eigene Fläche).
  const playableTracks = tracks.filter((t2) => t2.trackType === 'LOCAL' && t2.duration > 0);
  const queue: PlayerTrack[] = playableTracks.map((t2) => ({
    id: t2.id,
    title: t2.title,
    artist: formatArtistDisplay(t2),
    duration: t2.duration,
    url: `/api/tracks/${t2.id}/stream`,
    coverUrl: t2.coverUrl || undefined,
    isLocal: false,
    aiDisclosure: (t2.aiDisclosure as PlayerTrack['aiDisclosure']) ?? null,
  }));
  const queueIndexById = new Map(queue.map((q, i) => [q.id, i]));

  // Filter-Optionen für LibraryFilters formatieren
  const genreOptions = genreGroups
    .filter((g) => g.genre)
    .sort((a, b) => b._count._all - a._count._all)
    .map((g) => ({ value: g.genre as string, label: g.genre as string, count: g._count._all }));

  const poolOptions = allPools
    .filter((p) => p._count.tracks > 0)
    .map((p) => ({ value: p.slug, label: p.name, count: p._count.tracks }));

  const artistOptions = allArtists
    .filter((a) => a._count.artistTracks > 0)
    .map((a) => ({
      value: a.username,
      label: a.displayName || a.username,
      count: a._count.artistTracks,
    }));

  // Helper für Pagination-Links: searchParams ohne page-Override beibehalten
  const buildPageHref = (targetPage: number): string => {
    const sp = new URLSearchParams();
    if (sort !== 'newest') sp.set('sort', sort);
    if (genre) sp.set('genre', genre);
    if (poolSlug) sp.set('pool', poolSlug);
    if (artistUsername) sp.set('artist', artistUsername);
    if (targetPage > 1) sp.set('page', String(targetPage));
    const qs = sp.toString();
    return qs ? `/library?${qs}` : '/library';
  };

  return (
    <section style={{ padding: '40px 24px' }}>
      <LibraryQueue tracks={queue}>
      <SectionTitle sub="L" label={t('sectionLabel')} title={t('sectionTitle')} accent="green" />

      {/* Tagline + Count */}
      <div
        style={{
          marginTop: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'rgba(255,255,255,0.7)',
            margin: 0,
            maxWidth: 640,
            lineHeight: 1.6,
          }}
        >
          {t('tagline')}
        </p>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            color: '#3FCF4A',
            letterSpacing: '0.15em',
            border: '1px solid rgba(63,207,74,0.4)',
            padding: '4px 10px',
            background: 'rgba(63,207,74,0.08)',
          }}
        >
          [{t('trackCount', { count: totalCount })}]
        </span>
        {/* Direkte Wiedergabe der sichtbaren (gefilterten) Seite */}
        <LibraryPlayAll label={t('playAllLabel')} />
        <Link
          href="/playlists"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '8px 14px',
            border: '1px solid rgba(245,208,46,0.5)',
            color: '#F5D02E',
            fontFamily: 'var(--font-display)',
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.15em',
            textDecoration: 'none',
            textTransform: 'uppercase',
          }}
        >
          {t('playlistsLink')} →
        </Link>
        {/* PUP + GLITCH stoebern in der Leerstelle neben dem Zaehler —
            neutral, ohne Rahmen/Linien (Design-Regel 12.07.). */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'flex-end' }}>
          <DanceSprite name="pup" size={44} bobDelayMs={-400} />
          <DanceSprite name="ai-girl-glitch" size={48} bobDelayMs={-1000} />
        </div>
      </div>

      {/* Filter-Bar (Client-Component für instant URL-update) */}
      <LibraryFilters
        sort={sort}
        genre={genre}
        pool={poolSlug}
        artist={artistUsername}
        genres={genreOptions}
        pools={poolOptions}
        artists={artistOptions}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Track-Liste oder Empty-State */}
      {tracks.length === 0 ? (
        <div
          className="kbk-obsidian framed"
          style={{
            marginTop: 32,
            padding: '60px 20px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 900,
              color: '#3FCF4A',
              letterSpacing: '0.1em',
              marginBottom: 10,
              textShadow: '0 0 18px rgba(63,207,74,0.5)',
            }}
          >
            {hasActiveFilters ? t('emptyNoMatches') : t('emptyArchive')}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.15em',
            }}
          >
            {hasActiveFilters
              ? t('emptyNoMatchesHint')
              : t('emptyArchiveHint')}
          </div>
        </div>
      ) : (
        <>
          <div
            className="kbk-obsidian framed"
            style={{
              marginTop: 24,
            }}
          >
            {/* Tabellen-Header */}
            <div
              className="kbk-library-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 7rem 5rem 5rem',
                gap: 14,
                padding: '12px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'rgba(255,255,255,0.5)',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
              }}
            >
              <span>{t('colTrack')}</span>
              <span className="kbk-hide-on-mobile">{t('colGenre')}</span>
              <span className="kbk-hide-on-mobile" style={{ textAlign: 'right' }}>{t('colTime')}</span>
              <span style={{ textAlign: 'right' }}>{t('colLinks')}</span>
            </div>

            {tracks.map((track) => {
              // ADR-041: formatArtistDisplay priorisiert den Profil-Namen externer Künstler.
              const artistName = formatArtistDisplay(track)
              const hasSoundcloud = track.trackType === 'SOUNDCLOUD' && track.soundcloudUrl
              const c = genreColor(track.genre)
              const isAi = track.aiDisclosure && track.aiDisclosure !== 'human'
              const qIndex = queueIndexById.get(track.id)

              return (
                <div
                  key={track.id}
                  className="kbk-library-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 7rem 5rem 5rem',
                    gap: 14,
                    padding: '12px 14px',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {/* Track-Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        background: 'rgba(0,0,0,0.4)',
                        border: `1px solid ${c}40`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      <SafeImg
                        src={track.coverUrl || (track.trackType === 'SOUNDCLOUD' ? track.soundcloudArtwork : null)}
                        alt={track.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        fallback={<IcoTrack size={20} style={{ opacity: 0.6 }} />}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Link
                        prefetch={false}
                        href={`/tracks/${track.slug}`}
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 14,
                          fontWeight: 900,
                          color: '#fff',
                          letterSpacing: '0.02em',
                          textDecoration: 'none',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {track.title}
                      </Link>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          color: 'rgba(255,255,255,0.5)',
                          marginTop: 2,
                          letterSpacing: '0.08em',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span style={{ color: '#3FCF4A' }}>{artistName}</span>
                        {track.bpm ? ` // ${track.bpm} BPM` : ''}
                        {isAi && (
                          <span
                            style={{
                              marginLeft: 8,
                              background: '#8B5CF6',
                              color: '#0A0B0C',
                              padding: '1px 5px',
                              fontWeight: 900,
                              fontSize: 9,
                              letterSpacing: '0.15em',
                            }}
                          >
                            AI
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Genre */}
                  <span
                    className="kbk-hide-on-mobile"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: c,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {track.genre || '—'}
                  </span>

                  {/* Dauer */}
                  <span
                    className="kbk-hide-on-mobile"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.5)',
                      letterSpacing: '0.1em',
                      textAlign: 'right',
                    }}
                  >
                    {track.duration > 0 ? formatTime(track.duration) : '—'}
                  </span>

                  {/* Links */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      justifyContent: 'flex-end',
                    }}
                  >
                    {qIndex !== undefined ? (
                      /* Direkter Sofort-Play (LOCAL) — Queue = sichtbare Seite */
                      <LibraryRowPlay
                        index={qIndex}
                        playLabel={t('playDirect')}
                        pauseLabel={t('pauseDirect')}
                      />
                    ) : (
                      /* SC-/nicht-abspielbare Tracks: weiter über die Detail-Seite */
                      <Link
                        prefetch={false}
                        href={`/tracks/${track.slug}`}
                        title={t('playOnKbk')}
                        style={{
                          width: 44,
                          height: 44,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid rgba(63,207,74,0.3)',
                          color: '#3FCF4A',
                          textDecoration: 'none',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 0,
                            height: 0,
                            borderLeft: '9px solid #3FCF4A',
                            borderTop: '6px solid transparent',
                            borderBottom: '6px solid transparent',
                            marginLeft: 2,
                            filter: 'drop-shadow(0 0 4px rgba(63,207,74,0.5))',
                          }}
                        />
                      </Link>
                    )}

                    {hasSoundcloud && (
                      <a
                        href={track.soundcloudUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('openOnSoundcloud')}
                        style={{
                          width: 44,
                          height: 44,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid rgba(245,208,46,0.3)',
                          color: '#F5D02E',
                          textDecoration: 'none',
                        }}
                      >
                        <IcoWave size={16} />
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              buildHref={buildPageHref}
              t={t}
            />
          )}
        </>
      )}
      </LibraryQueue>
    </section>
  )
}

/**
 * Pagination — Server-Component, alle Links sind direkte URLs.
 * Kein Client-State. Page-Numbers mit Window-Logik (max ~7 sichtbar).
 */
function Pagination({
  page,
  totalPages,
  buildHref,
  t,
}: {
  page: number;
  totalPages: number;
  buildHref: (p: number) => string;
  t: LibraryT;
}) {
  // Window-Logik: zeige immer page-1, page, page+1 + 1, totalPages.
  // Sliding-Range damit nicht 100 Page-Buttons rendern.
  const range: (number | 'gap')[] = [];
  const add = (n: number) => {
    if (range[range.length - 1] !== n) range.push(n);
  };
  add(1);
  if (page - 2 > 2) range.push('gap');
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
    add(i);
  }
  if (page + 2 < totalPages - 1) range.push('gap');
  if (totalPages > 1) add(totalPages);

  return (
    <nav
      aria-label={t('paginationAria')}
      style={{
        marginTop: 24,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <PageBtn
        href={page > 1 ? buildHref(page - 1) : null}
        label={`‹ ${t('paginationPrev')}`}
      />
      {range.map((item, idx) =>
        item === 'gap' ? (
          <span
            key={`gap-${idx}`}
            style={{
              color: 'rgba(255,255,255,0.35)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              padding: '0 4px',
            }}
          >
            …
          </span>
        ) : (
          <PageBtn
            key={item}
            href={item === page ? null : buildHref(item)}
            label={String(item)}
            current={item === page}
          />
        )
      )}
      <PageBtn
        href={page < totalPages ? buildHref(page + 1) : null}
        label={`${t('paginationNext')} ›`}
      />
    </nav>
  );
}

function PageBtn({
  href,
  label,
  current = false,
}: {
  href: string | null;
  label: string;
  current?: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 38,
    height: 38,
    padding: '0 10px',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    letterSpacing: '0.06em',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 6,
    background: 'rgba(10,11,12,0.85)',
    textDecoration: 'none',
  };

  if (current) {
    return (
      <span
        aria-current="page"
        style={{
          ...baseStyle,
          background: '#3FCF4A',
          borderColor: '#3FCF4A',
          color: '#0A0B0C',
          fontWeight: 900,
        }}
      >
        {label}
      </span>
    );
  }
  if (!href) {
    return (
      <span
        aria-disabled="true"
        style={{
          ...baseStyle,
          color: 'rgba(255,255,255,0.25)',
          cursor: 'not-allowed',
        }}
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      style={{
        ...baseStyle,
        color: '#fff',
      }}
    >
      {label}
    </Link>
  );
}
