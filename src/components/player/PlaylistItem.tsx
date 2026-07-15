'use client';

/**
 * PlaylistItem-Komponente
 *
 * Einzelner Track in der Playlist.
 * Migriert von: .song-element im Original.
 *
 * Zustaende:
 * - Aktiv (aktuell spielend) -> grüner Akzent
 * - Gespielt -> dezente Markierung
 * - Normal -> Standard-Darstellung
 */

import { useCallback } from 'react';
import { Play, Pause, X, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatTime, cn } from '@/lib/utils';
import { useToast } from '@/components/providers/ToastProvider';
import type { PlayerTrack } from '@/types';

interface PlaylistItemProps {
  track: PlayerTrack;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  isPlayed: boolean;
  onPlay: () => void;
  onRemove?: () => void;
}

export default function PlaylistItem({
  track,
  index,
  isActive,
  isPlaying,
  isPlayed,
  onPlay,
  onRemove,
}: PlaylistItemProps) {
  const { toast } = useToast();
  const t = useTranslations('player');

  const handleShare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Wenn Track einen Slug hat, Track-Detail-Link teilen
    const slug = (track as PlayerTrack & { slug?: string }).slug;
    const url = slug
      ? `${window.location.origin}/tracks/${slug}`
      : `${window.location.origin}/player`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ type: 'success', message: t('item.linkCopied', { title: track.title }) });
    });
  }, [track, toast, t]);

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer',
        isActive
          ? 'bg-rasta-green/10 border border-rasta-green/20'
          : isPlayed
            ? 'bg-kbk-dark-800/50 hover:bg-kbk-dark-800'
            : 'hover:bg-kbk-dark-800'
      )}
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(); } }}
    >
      {/* Nummer / Play-Icon */}
      <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 text-sm">
        {isActive && isPlaying ? (
          <Pause size={16} className="text-rasta-green" />
        ) : isActive ? (
          <Play size={16} className="text-rasta-green ml-0.5" />
        ) : (
          <span
            className={cn(
              'group-hover:hidden tabular-nums',
              isPlayed ? 'text-muted/50' : 'text-muted'
            )}
          >
            {index + 1}
          </span>
        )}
        {/* Play-Icon on hover (nur wenn nicht aktiv) */}
        {!isActive && (
          <Play
            size={16}
            className="hidden group-hover:block text-foreground ml-0.5"
          />
        )}
      </div>

      {/* Track-Info */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'font-medium truncate text-sm',
            isActive
              ? 'text-rasta-green'
              : isPlayed
                ? 'text-muted'
                : 'text-foreground'
          )}
        >
          {track.title}
        </p>
        <p className="text-xs text-muted truncate">
          {track.artist}
          {track.isLocal && (
            <span className="ml-1.5 text-rasta-yellow/70">{t('item.localBadge')}</span>
          )}
          {track.isSoundcloud && (
            <span className="ml-1.5 text-orange-400/70">(SoundCloud)</span>
          )}
        </p>
      </div>

      {/* Duration */}
      <span
        className={cn(
          'text-xs tabular-nums shrink-0',
          isActive ? 'text-rasta-green/70' : 'text-muted'
        )}
      >
        {track.duration > 0 ? formatTime(track.duration) : '--:--'}
      </span>

      {/* Share-Button */}
      <button
        onClick={handleShare}
        className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all cursor-pointer text-muted hover:text-rasta-yellow"
        aria-label={t('item.share', { title: track.title })}
        title={t('item.copyLink')}
      >
        <Share2 size={14} />
      </button>

      {/* Remove-Button (nur für lokale Tracks) */}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-rasta-red transition-all cursor-pointer"
          aria-label={t('item.remove', { title: track.title })}
          title={t('item.removeFromPlaylist')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
