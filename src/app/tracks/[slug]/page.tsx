import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import TrackDetailClient from './TrackDetailClient';

/**
 * Track-Detail-Seite
 *
 * Server-Component: Lädt Track per Slug aus der DB, generiert dynamische
 * Metadata (OG Tags, JSON-LD MusicRecording), rendert Client-Component.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Dynamische Metadata pro Track (OG Tags, Titel, Beschreibung)
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  const track = await prisma.track.findUnique({
    where: { slug },
    select: {
      title: true,
      description: true,
      genre: true,
      coverUrl: true,
      soundcloudArtwork: true,
      artist: { select: { displayName: true, username: true } },
      featuringArtist: { select: { displayName: true, username: true } },
    },
  });

  const tMeta = await getTranslations('meta.track');

  if (!track) {
    return { title: tMeta('notFound') };
  }

  const main = track.artist?.displayName || track.artist?.username || 'KBK';
  const feat = track.featuringArtist?.displayName || track.featuringArtist?.username;
  const artistName = feat ? `${main} feat. ${feat}` : main;
  const image = track.coverUrl || track.soundcloudArtwork || '/images/logo-4flow.png';
  const description = track.description || tMeta('fallbackDescription', { title: track.title, artist: artistName });

  return {
    title: `${track.title} — ${artistName}`,
    description,
    openGraph: {
      title: `${track.title} — ${artistName}`,
      description,
      type: 'music.song',
      images: [{ url: image }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${track.title} — ${artistName}`,
      description,
      images: [image],
    },
  };
}

export default async function TrackDetailPage({ params }: PageProps) {
  const { slug } = await params;

  // Track mit allen Feldern laden
  const track = await prisma.track.findUnique({
    where: { slug },
    include: {
      artist: {
        select: { id: true, username: true, displayName: true },
      },
      // v2.8: Featuring-Artist mitladen.
      featuringArtist: {
        select: { id: true, username: true, displayName: true },
      },
    },
  });

  // 404 wenn nicht gefunden oder nicht öffentlich
  if (!track || !track.isPublic) {
    notFound();
  }

  // Verwandte Tracks laden (gleiches Genre oder gleicher Künstler, max 3)
  const relatedTracks = await prisma.track.findMany({
    where: {
      isPublic: true,
      id: { not: track.id },
      OR: [
        ...(track.genre ? [{ genre: track.genre }] : []),
        { artistId: track.artistId },
      ],
    },
    orderBy: { playCount: 'desc' },
    take: 3,
    select: {
      id: true,
      title: true,
      slug: true,
      trackType: true,
      genre: true,
      duration: true,
      coverUrl: true,
      soundcloudArtwork: true,
      artist: { select: { displayName: true, username: true } },
    },
  });

  const mainArtist = track.artist?.displayName || track.artist?.username || 'KBK';
  const featuringArtist = track.featuringArtist?.displayName || track.featuringArtist?.username;
  const artistName = featuringArtist ? `${mainArtist} feat. ${featuringArtist}` : mainArtist;
  const artwork = track.coverUrl || track.soundcloudArtwork || null;

  // JSON-LD: MusicRecording Schema (v2.8: byArtist als Array bei Featuring)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicRecording',
    name: track.title,
    url: `https://kaboomkartell.com/tracks/${track.slug}`,
    byArtist: featuringArtist
      ? [
          { '@type': 'Person', name: mainArtist },
          { '@type': 'Person', name: featuringArtist },
        ]
      : { '@type': 'Person', name: mainArtist },
    ...(track.duration && track.duration > 0 ? {
      duration: `PT${Math.floor(track.duration / 60)}M${Math.floor(track.duration % 60)}S`,
    } : {}),
    ...(track.genre ? { genre: track.genre } : {}),
    ...(artwork ? { image: artwork } : {}),
    ...(track.description ? { description: track.description } : {}),
    inAlbum: {
      '@type': 'MusicAlbum',
      name: 'KaboomKartell Releases',
      byArtist: { '@type': 'MusicGroup', name: 'KaboomKartell' },
    },
  };

  // Daten für die Client-Component vorbereiten (nur serialisierbare Felder)
  const trackData = {
    id: track.id,
    title: track.title,
    slug: track.slug,
    trackType: track.trackType,
    duration: track.duration,
    genre: track.genre,
    bpm: track.bpm,
    description: track.description,
    playCount: track.playCount,
    coverUrl: track.coverUrl,
    soundcloudUrl: track.soundcloudUrl,
    soundcloudEmbedUrl: track.soundcloudEmbedUrl,
    soundcloudArtwork: track.soundcloudArtwork,
    artistName,
    artistUsername: track.artist?.username || null,
    streamUrl: track.trackType === 'LOCAL' ? `/api/tracks/${track.id}/stream` : null,
    // AI-Disclosure
    aiDisclosure: track.aiDisclosure,
    aiSource: track.aiSource,
    // Voting-Stats
    auraCount: track.auraCount,
    susCount: track.susCount,
    totalVotes: track.totalVotes,
    susPercentage: track.susPercentage,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TrackDetailClient
        track={trackData}
        relatedTracks={relatedTracks.map((t) => ({
          id: t.id,
          title: t.title,
          slug: t.slug,
          trackType: t.trackType,
          genre: t.genre,
          duration: t.duration,
          coverUrl: t.coverUrl || t.soundcloudArtwork || null,
          artistName: t.artist?.displayName || t.artist?.username || 'KBK',
        }))}
      />
    </>
  );
}
