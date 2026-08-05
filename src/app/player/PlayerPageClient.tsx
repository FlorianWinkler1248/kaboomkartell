'use client';

/**
 * Player-Seite — die Vollbild-Ansicht des Player-Modus (05.08.2026).
 *
 * Die untere Leiste ist die Alltags-Bedienung; hier ist Platz für alles, was
 * dort nicht hinpasst: großes Now-Playing, Statistiken, die vollständige
 * Warteschlange — und eine Ablagefläche, auf die man eigene MP3s ziehen kann.
 *
 * Wichtig: Diese Seite kippt NICHT mehr ungefragt die ganze Bibliothek in die
 * Warteschlange. Vorher tat sie das beim Öffnen — wer eine Playlist hörte und
 * hier nachsah, bekam seine Auswahl überschrieben. Die Warteschlange gehört
 * dem Hörer; sie wird nur auf ausdrücklichen Klick befüllt.
 */

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import MusicPlayer from '@/components/player/MusicPlayer';
import { usePlayer } from '@/components/providers/PlayerProvider';
import type { PlayerTrack } from '@/types';

export default function PlayerPageClient() {
  const t = useTranslations('pagesUi');
  const tp = useTranslations('player');
  const { playlist, playTracks, returnToRadio, playbackMode } = usePlayer();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasQueue = playlist.tracks.length > 0;

  // Bibliothek auf Klick laden — und direkt losspielen, damit der Knopf hält,
  // was er verspricht.
  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tracks?pageSize=100');
      const json = await res.json();
      if (!json.success || !json.data?.length) {
        setError(t('playerLoadFailed'));
        return;
      }
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
        featuringArtist?: { displayName: string | null; username: string } | null;
        aiDisclosure?: 'human' | 'ai_assisted' | 'ai_generated' | null;
      }) => {
        const main = track.artist?.displayName || track.artist?.username || 'KBK';
        const feat = track.featuringArtist?.displayName || track.featuringArtist?.username;
        return {
          id: track.id,
          title: track.title,
          // „4Flow feat. Boomy", wenn ein Featuring-Artist gesetzt ist — ohne das
          // verlören hier geladene Titel ihre Schreibweise, und die AI-Kennzeichnung
          // fiele weg, obwohl sie überall sonst angezeigt wird.
          artist: feat ? `${main} feat. ${feat}` : main,
          duration: track.duration || 0,
          url: track.trackType === 'SOUNDCLOUD' ? (track.soundcloudUrl || '') : track.streamUrl,
          coverUrl: track.coverUrl || undefined,
          isLocal: false,
          isSoundcloud: track.trackType === 'SOUNDCLOUD',
          soundcloudEmbedUrl: track.soundcloudEmbedUrl || undefined,
          aiDisclosure: track.aiDisclosure ?? null,
        };
      });
      playTracks(tracks, 0);
    } catch (err) {
      console.error('Error loading tracks:', err);
      setError(t('playerLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t, playTracks]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-10">
        <h1 className="font-heading font-bold text-4xl sm:text-5xl mb-4">
          <span className="text-rasta-gradient">Player</span>
        </h1>
        <div
          className="w-24 h-1 mx-auto rounded-full"
          style={{ background: 'var(--gradient-rasta)' }}
        />
        <p className="mt-6 text-lg text-secondary">
          {hasQueue
            ? t('playerTracksAvailable', { count: playlist.tracks.length })
            : tp('mode.emptyHint')}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {!hasQueue && (
            <button
              type="button"
              onClick={loadLibrary}
              disabled={isLoading}
              className="px-4 py-2 border border-border text-sm font-heading tracking-wider disabled:opacity-50"
              style={{ borderColor: '#8B5CF6', color: '#8B5CF6' }}
            >
              {isLoading ? tp('mode.loadingLibrary') : tp('mode.loadLibrary')}
            </button>
          )}
          {playbackMode === 'player' && (
            <button
              type="button"
              onClick={() => { void returnToRadio(); }}
              className="px-4 py-2 border border-border text-sm font-heading tracking-wider text-secondary"
            >
              {tp('mode.backToRadio')}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-rasta-green" size={32} />
          <span className="ml-3 text-secondary">{t('playerLoadingTracks')}</span>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-rasta-red/10 border border-rasta-red/20 text-rasta-red text-sm text-center">
              {error}
            </div>
          )}
          <MusicPlayer />
        </>
      )}
    </div>
  );
}
