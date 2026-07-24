/**
 * ShowcaseSection — Artist-Showcase auf der Homepage (ADR-041).
 *
 * Zeigt kuratierte Showcase-Playlists (type='showcase') mit externen
 * Künstlern prominent direkt nach der HumanArtistsSection: erst der Pitch
 * („Human Artists Wanted"), dann der Beweis, dass externe Künstler hier
 * groß gespielt werden.
 *
 * Blendet sich komplett aus, solange keine aktive Showcase-Playlist mit
 * öffentlichen Tracks existiert (wie CrowdControlSection) — kein leerer
 * Platzhalter auf der Startseite.
 */

import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import { formatArtistDisplay } from '@/lib/track-display';
import ShowcaseRail, { type ShowcasePlaylistItem } from './ShowcaseRail';

const MAX_PLAYLISTS = 2;
const MAX_TRACKS_PER_RAIL = 6;

export default async function ShowcaseSection() {
  const t = await getTranslations('showcase');

  let playlists: ShowcasePlaylistItem[] = [];
  try {
    const rows = await prisma.playlist.findMany({
      where: { type: 'showcase', isActive: true },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: MAX_PLAYLISTS,
      include: {
        tracks: {
          include: {
            track: {
              include: {
                artist: { select: { id: true, username: true, displayName: true } },
                featuringArtist: { select: { id: true, username: true, displayName: true } },
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    playlists = rows
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        tracks: p.tracks
          .filter((pt) => pt.track.isPublic)
          .slice(0, MAX_TRACKS_PER_RAIL)
          .map((pt) => ({
            id: pt.track.id,
            title: pt.track.title,
            slug: pt.track.slug,
            trackType: pt.track.trackType,
            genre: pt.track.genre,
            artistLabel: formatArtistDisplay(pt.track),
            artworkUrl: pt.track.coverUrl || pt.track.soundcloudArtwork || null,
            soundcloudUrl: pt.track.soundcloudUrl,
            soundcloudEmbedUrl: pt.track.soundcloudEmbedUrl,
          })),
      }))
      .filter((p) => p.tracks.length > 0);
  } catch (err) {
    console.error('ShowcaseSection query failed:', err);
    return null;
  }

  if (playlists.length === 0) return null;

  return (
    <div className="kbk-page-section" style={{ padding: '20px 24px' }}>
      <SectionTitle sub="07" label={t('sectionLabel')} title={t('sectionTitle')} accent="red" />
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'rgba(255,255,255,0.6)',
          letterSpacing: '0.05em',
          marginTop: 10,
          marginBottom: 0,
          maxWidth: 640,
          lineHeight: 1.6,
        }}
      >
        {t('subtitle')}
      </p>
      <ShowcaseRail playlists={playlists} />
    </div>
  );
}
