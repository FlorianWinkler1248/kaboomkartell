'use client';

/**
 * Player-Seite Client-Komponente
 *
 * Lädt publizierte Tracks vom Server und übergibt sie an den MusicPlayer.
 * Zusätzlich können lokale Dateien per Drag & Drop hinzugefügt werden.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import MusicPlayer from '@/components/player/MusicPlayer';
import type { PlayerTrack } from '@/types';

export default function PlayerPageClient() {
  const t = useTranslations('pagesUi');
  const [serverTracks, setServerTracks] = useState<PlayerTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server-Tracks laden
  useEffect(() => {
    async function loadTracks() {
      try {
        const res = await fetch('/api/tracks?pageSize=100');
        const json = await res.json();

        if (json.success && json.data) {
          // Server-Tracks in PlayerTrack-Format konvertieren
          const tracks: PlayerTrack[] = json.data.map((track: {
            id: string;
            title: string;
            trackType?: string;
            duration: number;
            coverUrl: string | null;
            streamUrl: string;
            soundcloudUrl?: string;
            soundcloudEmbedUrl?: string;
            artist: { displayName: string | null; username: string };
          }) => ({
            id: track.id,
            title: track.title,
            artist: track.artist?.displayName || track.artist?.username || 'KBK',
            duration: track.duration || 0,
            url: track.trackType === 'SOUNDCLOUD' ? (track.soundcloudUrl || '') : track.streamUrl,
            coverUrl: track.coverUrl || undefined,
            isLocal: false,
            isSoundcloud: track.trackType === 'SOUNDCLOUD',
            soundcloudEmbedUrl: track.soundcloudEmbedUrl || undefined,
          }));

          setServerTracks(tracks);
        }
      } catch (err) {
        console.error('Error loading tracks:', err);
        setError(t('playerLoadFailed'));
      } finally {
        setIsLoading(false);
      }
    }

    loadTracks();
  }, [t]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="font-heading font-bold text-4xl sm:text-5xl mb-4">
          <span className="text-rasta-gradient">Player</span>
        </h1>
        <div
          className="w-24 h-1 mx-auto rounded-full"
          style={{ background: 'var(--gradient-rasta)' }}
        />
        <p className="mt-6 text-lg text-secondary">
          {t('playerIntro')}
          {serverTracks.length > 0
            ? ` ${t('playerTracksAvailable', { count: serverTracks.length })}`
            : ` ${t('playerDragHint')}`}
        </p>
      </div>

      {/* Loading-State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-rasta-green" size={32} />
          <span className="ml-3 text-secondary">{t('playerLoadingTracks')}</span>
        </div>
      ) : (
        <>
          {/* Error */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-rasta-red/10 border border-rasta-red/20 text-rasta-red text-sm text-center">
              {error}
            </div>
          )}

          {/* Music Player */}
          <MusicPlayer initialTracks={serverTracks} />
        </>
      )}
    </div>
  );
}
