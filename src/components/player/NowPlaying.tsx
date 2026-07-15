'use client';

/**
 * NowPlaying-Anzeige
 *
 * Zeigt den aktuellen Track: Cover-Art, Titel, Künstler.
 * Migriert von: .player-info Bereich im Original.
 */

import { useTranslations } from 'next-intl';
import { Music2 } from 'lucide-react';
import type { PlayerTrack } from '@/types';
import { SafeImg } from '@/components/ui/SafeImg';

interface NowPlayingProps {
  track: PlayerTrack | null;
  isPlaying: boolean;
}

export default function NowPlaying({ track, isPlaying }: NowPlayingProps) {
  const t = useTranslations('playerUi');
  return (
    <div className="flex items-center gap-4">
      {/* Cover Art / Platzhalter */}
      <div className="w-16 h-16 rounded-lg bg-kbk-dark-800 flex items-center justify-center shrink-0 overflow-hidden relative">
        <SafeImg
          src={track?.coverUrl}
          alt={track?.title}
          className="w-full h-full object-cover"
          fallback={
            <Music2
              size={28}
              className={`text-rasta-green transition-transform duration-700 ${
                isPlaying ? 'animate-pulse scale-110' : 'scale-100'
              }`}
            />
          }
        />
        {/* Playing-Indicator */}
        {isPlaying && (
          <div className="absolute bottom-1 right-1 flex items-end gap-[2px]">
            <span className="w-[3px] h-2 bg-rasta-green rounded-sm animate-[equalizer_0.5s_ease-in-out_infinite_alternate]" />
            <span className="w-[3px] h-3 bg-rasta-yellow rounded-sm animate-[equalizer_0.5s_ease-in-out_0.2s_infinite_alternate]" />
            <span className="w-[3px] h-2 bg-rasta-red rounded-sm animate-[equalizer_0.5s_ease-in-out_0.4s_infinite_alternate]" />
          </div>
        )}
      </div>

      {/* Track-Info */}
      <div className="min-w-0 flex-1">
        {track ? (
          <>
            <p className="font-heading font-semibold text-foreground truncate">
              {track.title}
            </p>
            <p className="text-sm text-muted truncate">
              {track.artist}
            </p>
            {track.isLocal && (
              <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-rasta-yellow/10 text-rasta-yellow rounded-full">
                {t('local')}
              </span>
            )}
            {track.isSoundcloud && (
              <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-orange-500/10 text-orange-400 rounded-full">
                SoundCloud
              </span>
            )}
          </>
        ) : (
          <>
            <p className="font-heading font-semibold text-foreground">
              {t('noTrackLoaded')}
            </p>
            <p className="text-sm text-muted">
              {t('selectTrack')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
