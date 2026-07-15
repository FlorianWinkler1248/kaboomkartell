import Link from 'next/link';
import { Music2, Play, Clock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { formatTime } from '@/lib/utils';
import { SafeImg } from '@/components/ui/SafeImg';

/**
 * FeaturedTracks - Neueste veröffentlichte Tracks
 *
 * Server-Komponente: Lädt die 6 neusten PUBLISHED Tracks direkt aus der DB.
 * Zeigt Card-Grid mit Cover-Platzhalter, Titel, Künstler, Genre, Dauer.
 * Falls keine Tracks: Einladung zum Player mit Drag&Drop-Hinweis.
 */

interface TrackWithArtist {
  id: string;
  title: string;
  slug: string;
  trackType: string;
  genre: string | null;
  duration: number | null;
  coverUrl: string | null;
  artist: {
    displayName: string | null;
    username: string;
  };
  featuringArtist: {
    displayName: string | null;
    username: string;
  } | null;
}

export default async function FeaturedTracks() {
  const t = await getTranslations('landing');

  // Neueste 6 published Tracks direkt aus der DB
  let tracks: TrackWithArtist[] = [];

  try {
    tracks = await prisma.track.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        title: true,
        slug: true,
        trackType: true,
        genre: true,
        duration: true,
        coverUrl: true,
        artist: {
          select: {
            displayName: true,
            username: true,
          },
        },
        // v2.8: Featuring-Artist mitladen.
        featuringArtist: {
          select: {
            displayName: true,
            username: true,
          },
        },
      },
    });
  } catch {
    // DB-Fehler: Leere Liste als Fallback
  }

  // JSON-LD: MusicRecording Schema pro Track (v2.8 Featuring-aware)
  const tracksJsonLd = tracks.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: tracks.map((track, i) => {
      const main = track.artist.displayName || track.artist.username;
      const feat = track.featuringArtist?.displayName || track.featuringArtist?.username;
      return ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'MusicRecording',
        name: track.title,
        url: `https://kaboomkartell.com/player`,
        byArtist: feat
          ? [
              { '@type': 'Person', name: main },
              { '@type': 'Person', name: feat },
            ]
          : { '@type': 'Person', name: main },
        ...(track.duration && track.duration > 0 ? {
          duration: `PT${Math.floor(track.duration / 60)}M${Math.floor(track.duration % 60)}S`,
        } : {}),
        ...(track.genre ? { genre: track.genre } : {}),
        ...(track.coverUrl ? { image: track.coverUrl } : {}),
        inAlbum: {
          '@type': 'MusicAlbum',
          name: 'KaboomKartell Releases',
          byArtist: { '@type': 'MusicGroup', name: 'KaboomKartell' },
        },
      },
    });
    }),
  } : null;

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      {tracksJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(tracksJsonLd) }}
        />
      )}
      <h2 className="font-heading font-bold text-3xl sm:text-4xl text-center mb-4">
        <span className="text-rasta-gradient">{t('featuredHeading')}</span>
      </h2>
      <p className="text-center text-secondary mb-12 max-w-2xl mx-auto">
        {t('featuredSubtitle')}
      </p>

      {tracks.length > 0 ? (
        /* Echte Tracks */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tracks.map((track) => (
            <article key={track.id}>
            <Link
              href={`/tracks/${track.slug}`}
              className="rounded-xl bg-surface border border-border p-5 hover:border-rasta-green/30 transition-all group block"
            >
              {/* Cover-Area */}
              <div className="aspect-square rounded-lg bg-kbk-dark-800 mb-4 flex items-center justify-center overflow-hidden relative">
                {track.trackType === 'SOUNDCLOUD' && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold bg-orange-500/80 text-white rounded-full z-10">
                    SoundCloud
                  </span>
                )}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 flex items-center justify-center">
                  <div className={`w-14 h-14 rounded-full ${track.trackType === 'SOUNDCLOUD' ? 'bg-orange-500' : 'bg-rasta-green'} flex items-center justify-center shadow-lg ${track.trackType === 'SOUNDCLOUD' ? 'shadow-orange-500/30' : 'shadow-rasta-green/30'}`}>
                    <Play size={24} className="text-white ml-1" fill="white" />
                  </div>
                </div>
                <SafeImg
                  src={track.coverUrl}
                  alt={track.title}
                  className="w-full h-full object-cover"
                  fallback={
                    <Music2
                      size={48}
                      className="text-kbk-dark-600 group-hover:text-kbk-dark-700 transition-colors"
                    />
                  }
                />
              </div>

              {/* Track-Info */}
              <h3 className="font-heading font-semibold text-lg text-foreground truncate group-hover:text-rasta-green transition-colors">
                {track.title}
              </h3>
              <p className="text-sm text-muted mt-1 flex items-center gap-2">
                <span className="truncate">
                  {(() => {
                    const m = track.artist.displayName || track.artist.username;
                    const f = track.featuringArtist?.displayName || track.featuringArtist?.username;
                    return f ? `${m} feat. ${f}` : m;
                  })()}
                </span>
                {track.genre && (
                  <>
                    <span className="text-kbk-dark-600">&bull;</span>
                    <span className="text-rasta-yellow/70">{track.genre}</span>
                  </>
                )}
              </p>
              {track.duration && track.duration > 0 && (
                <p className="text-xs text-muted/60 mt-2 flex items-center gap-1">
                  <Clock size={12} />
                  {formatTime(track.duration)}
                </p>
              )}
            </Link>
            </article>
          ))}
        </div>
      ) : (
        /* Leerer State: Einladung */
        <div className="text-center py-12 rounded-xl bg-surface border border-border">
          <Music2 size={48} className="mx-auto text-kbk-dark-600 mb-4" />
          <p className="text-secondary text-lg mb-2">
            {t('featuredEmptyTitle')}
          </p>
          <p className="text-muted text-sm mb-6">
            {t('featuredEmptyHint')}
          </p>
          <Link
            href="/library"
            className="inline-block px-6 py-2.5 text-sm font-semibold text-white bg-rasta-green rounded-lg hover:bg-rasta-green-light transition-all"
          >
            {t('featuredGoToPlayer')}
          </Link>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="text-center mt-10">
          <Link
            href="/library"
            className="text-rasta-green hover:text-rasta-green-light font-medium transition-colors"
          >
            {t('featuredListenAll')} &rarr;
          </Link>
        </div>
      )}
    </section>
  );
}
