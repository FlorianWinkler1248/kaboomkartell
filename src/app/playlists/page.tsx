import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { PLAYLIST_TYPE_LABELS } from '@/lib/constants';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import {
  IcoTrack,
  IcoStar,
  IcoRefresh,
} from '@/components/kbk/icons';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { SafeImg } from '@/components/ui/SafeImg';
import DanceSprite from '@/components/kbk/DanceSprite';

/**
 * Playlist-Uebersichtsseite (Cockpit-Style).
 *
 * Featured-Playlists oben, Rest sortiert nach createdAt.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.playlists');
  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      type: 'website',
    },
  };
}

async function getPlaylists() {
  try {
    const playlists = await prisma.playlist.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { tracks: true } },
        tracks: {
          include: {
            track: {
              select: { coverUrl: true, soundcloudArtwork: true },
            },
          },
          orderBy: { position: 'asc' },
          take: 4,
        },
      },
      orderBy: [
        { isFeatured: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return playlists.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      coverUrl: p.coverUrl,
      type: p.type,
      genre: p.genre,
      isFeatured: p.isFeatured,
      trackCount: p._count.tracks,
      previewCovers: p.tracks
        .map((pt) => pt.track.coverUrl || pt.track.soundcloudArtwork)
        .filter(Boolean) as string[],
    }));
  } catch {
    return [];
  }
}

// Genre/Type → Akzentfarbe.
function typeColor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('weekly')) return '#3FCF4A';
  if (t.includes('monthly')) return '#F5D02E';
  if (t === 'manual') return '#3FCF4A';
  return '#E63B2E';
}

export default async function PlaylistsPage() {
  const t = await getTranslations('playlists');
  const playlists = await getPlaylists();

  return (
    <section style={{ padding: '40px 24px' }}>
      <SectionTitle sub="P" label={t('sectionLabel')} title={t('sectionTitle')} accent="yellow" />

      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'rgba(255,255,255,0.7)',
          marginTop: 18,
          maxWidth: 640,
          lineHeight: 1.6,
        }}
      >
        {t('tagline')}
      </p>

      {/* cactus + wormy wippen in der Leerstelle zwischen Tagline und Grid —
          dezent rechtsbündig, rein dekorativ, ohne Rahmen/Linien und nicht auf
          den Karten (Design-Regel Dance-Sprites). */}
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: -6, marginBottom: 4 }}
        aria-hidden="true"
      >
        <DanceSprite name="cactus" size={46} bobDelayMs={-500} />
        <DanceSprite name="wormy" size={44} bobDelayMs={-1100} />
      </div>

      {/* Empty-State oder Grid */}
      {playlists.length === 0 ? (
        <div
          className="kbk-obsidian framed kbk-frame-yellow"
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
              color: '#F5D02E',
              letterSpacing: '0.1em',
              marginBottom: 10,
              textShadow: '0 0 18px rgba(245,208,46,0.5)',
            }}
          >
            {t('emptyTitle')}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.15em',
            }}
          >
            {t('emptyHint')}
          </div>
        </div>
      ) : (
        <div
          className="kbk-subpage-grid-3"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            marginTop: 28,
          }}
        >
          {playlists.map((playlist) => {
            const c = typeColor(playlist.type);
            return (
              <Link
                key={playlist.id}
                href={`/playlists/${playlist.slug}`}
                className="kbk-obsidian framed"
                style={{
                  ...obsidianFrameVars(c),
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  minHeight: 320,
                }}
              >
                {/* Cover */}
                <div
                  style={{
                    aspectRatio: '1 / 1',
                    position: 'relative',
                    background: 'rgba(0,0,0,0.4)',
                    overflow: 'hidden',
                  }}
                >
                  {playlist.previewCovers.length >= 4 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        width: '100%',
                        height: '100%',
                      }}
                    >
                      {playlist.previewCovers.slice(0, 4).map((cover, i) => (
                        <SafeImg
                          key={i}
                          src={cover}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                          fallback={
                            <div
                              style={{
                                width: '100%',
                                height: '100%',
                                background: 'rgba(0,0,0,0.4)',
                              }}
                            />
                          }
                        />
                      ))}
                    </div>
                  ) : playlist.coverUrl ? (
                    <SafeImg
                      src={playlist.coverUrl}
                      alt={playlist.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      fallback={
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <IcoTrack size={64} style={{ opacity: 0.3 }} />
                        </div>
                      }
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IcoTrack size={64} style={{ opacity: 0.3 }} />
                    </div>
                  )}

                  {/* Featured Badge */}
                  {playlist.isFeatured && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        background: '#F5D02E',
                        color: '#0A0B0C',
                        padding: '4px 8px',
                        fontFamily: 'var(--font-display)',
                        fontSize: 9,
                        fontWeight: 900,
                        letterSpacing: '0.15em',
                      }}
                    >
                      <IcoStar size={10} /> {t('featured')}
                    </div>
                  )}

                  {/* Type-Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 10,
                      right: 10,
                      background: c,
                      color: '#0A0B0C',
                      padding: '4px 8px',
                      fontFamily: 'var(--font-display)',
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {(PLAYLIST_TYPE_LABELS[playlist.type] || playlist.type).toUpperCase()}
                  </div>
                </div>

                {/* Info */}
                <div style={{ padding: 14 }}>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 16,
                      fontWeight: 900,
                      color: '#fff',
                      letterSpacing: '0.02em',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {playlist.name}
                  </h3>
                  {playlist.description && (
                    <p
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.6)',
                        lineHeight: 1.5,
                        marginTop: 6,
                        marginBottom: 0,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {playlist.description}
                    </p>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      marginTop: 12,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.5)',
                      letterSpacing: '0.1em',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>{t('trackCount', { count: playlist.trackCount })}</span>
                    {playlist.genre && <span>{playlist.genre.toUpperCase()}</span>}
                    {playlist.type !== 'manual' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <IcoRefresh size={10} /> {t('auto')}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
