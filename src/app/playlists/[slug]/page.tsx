import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { PLAYLIST_TYPE_LABELS } from '@/lib/constants';
import PlaylistDetailClient from './PlaylistDetailClient';

/**
 * Playlist-Detail-Seite
 *
 * Server-Component: Lädt Playlist mit Tracks, generiert Metadata.
 * PlaylistDetailClient übernimmt Player-Integration und Interaktivität.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  const playlist = await prisma.playlist.findUnique({
    where: { slug },
    select: { name: true, description: true, genre: true, coverUrl: true },
  });

  const tMeta = await getTranslations('meta.playlists');

  if (!playlist) return { title: tMeta('detailNotFound') };

  const description = playlist.description || tMeta('detailFallbackDescription', { name: playlist.name });

  return {
    title: playlist.name,
    description,
    openGraph: {
      title: `${playlist.name} — KaboomKartell`,
      description,
      type: 'music.playlist',
      ...(playlist.coverUrl && { images: [{ url: playlist.coverUrl }] }),
    },
  };
}

async function getPlaylistData(slug: string) {
  const playlist = await prisma.playlist.findUnique({
    where: { slug },
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

  if (!playlist || !playlist.isActive) return null;

  // Nur öffentliche Tracks
  const tracks = playlist.tracks
    .filter((pt) => pt.track.isPublic)
    .map((pt) => ({
      id: pt.track.id,
      title: pt.track.title,
      slug: pt.track.slug,
      trackType: pt.track.trackType,
      duration: pt.track.duration,
      coverUrl: pt.track.coverUrl,
      genre: pt.track.genre,
      bpm: pt.track.bpm,
      playCount: pt.track.playCount,
      aiDisclosure: pt.track.aiDisclosure,
      aiSource: pt.track.aiSource,
      auraCount: pt.track.auraCount,
      susCount: pt.track.susCount,
      totalVotes: pt.track.totalVotes,
      susPercentage: pt.track.susPercentage,
      artist: pt.track.artist,
      featuringArtist: pt.track.featuringArtist,
      streamUrl: pt.track.trackType === 'LOCAL' ? `/api/tracks/${pt.track.id}/stream` : '',
      soundcloudUrl: pt.track.trackType === 'SOUNDCLOUD' ? pt.track.soundcloudUrl : undefined,
      soundcloudEmbedUrl: pt.track.trackType === 'SOUNDCLOUD' ? pt.track.soundcloudEmbedUrl : undefined,
    }));

  return {
    id: playlist.id,
    name: playlist.name,
    slug: playlist.slug,
    description: playlist.description,
    coverUrl: playlist.coverUrl,
    type: playlist.type,
    typeLabel: PLAYLIST_TYPE_LABELS[playlist.type] || playlist.type,
    genre: playlist.genre,
    isFeatured: playlist.isFeatured,
    trackCount: tracks.length,
    tracks,
  };
}

export default async function PlaylistDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const playlist = await getPlaylistData(slug);

  if (!playlist) notFound();

  return <PlaylistDetailClient playlist={playlist} />;
}
