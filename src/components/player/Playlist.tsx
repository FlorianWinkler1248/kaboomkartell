'use client';

/**
 * Playlist-Komponente
 *
 * Zeigt alle Tracks in der Playlist + Drag & Drop für lokale Dateien.
 * Migriert von: .playlist und .drop-zone im Original.
 *
 * Features:
 * - Track-Liste mit Play/Played/Active-State
 * - Drag & Drop Zone für MP3-Dateien
 * - Leerer-State mit Anleitung
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { Upload, ListMusic, Trash2, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn, trackNameFromFile } from '@/lib/utils';
import PlaylistItem from './PlaylistItem';
import type { PlayerTrack } from '@/types';

interface PlaylistProps {
  tracks: PlayerTrack[];
  currentIndex: number;
  isPlaying: boolean;
  playedTrackIds: Set<string>;
  onPlayTrack: (index: number) => void;
  onAddTracks: (tracks: PlayerTrack[]) => void;
  onRemoveTrack: (trackId: string) => void;
  onClearPlaylist: () => void;
}

export default function Playlist({
  tracks,
  currentIndex,
  isPlaying,
  playedTrackIds,
  onPlayTrack,
  onAddTracks,
  onRemoveTrack,
  onClearPlaylist,
}: PlaylistProps) {
  const t = useTranslations('player');
  const [isDragOver, setIsDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Gefilterte Tracks mit Original-Index beibehalten
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks.map((track, i) => ({ track, originalIndex: i }));
    const q = searchQuery.toLowerCase();
    return tracks
      .map((track, i) => ({ track, originalIndex: i }))
      .filter(({ track }) =>
        track.title.toLowerCase().includes(q) ||
        track.artist.toLowerCase().includes(q)
      );
  }, [tracks, searchQuery]);

  // Suchfeld öffnen/schließen
  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      if (!prev) {
        // Öffnen -> Focus setzen
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else {
        // Schließen -> Query zurücksetzen
        setSearchQuery('');
      }
      return !prev;
    });
  }, []);

  /**
   * Verarbeitet MP3-Dateien (Drag & Drop oder File Input).
   * Migriert von: MP3Player.handleFiles()
   */
  const processFiles = useCallback(
    (files: FileList | File[]) => {
      const mp3Files = Array.from(files).filter(
        (f) => f.type === 'audio/mpeg' || f.name.toLowerCase().endsWith('.mp3')
      );

      if (mp3Files.length === 0) return;

      const newTracks: PlayerTrack[] = mp3Files.map((file) => ({
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: trackNameFromFile(file.name),
        artist: 'Local File',
        duration: 0, // Wird beim Laden aktualisiert
        url: URL.createObjectURL(file),
        isLocal: true,
      }));

      onAddTracks(newTracks);
    },
    [onAddTracks]
  );

  // === Drag & Drop Handlers ===
  // (Migriert von: dropZone Event Listeners im Original)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFiles(files);
      }
    },
    [processFiles]
  );

  // File Input Handler
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFiles(files);
        // Input zurücksetzen für wiederholte Auswahl
        e.target.value = '';
      }
    },
    [processFiles]
  );

  return (
    <div
      className="border-t border-border"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <ListMusic size={18} className="text-rasta-green" />
          <h3 className="font-heading font-semibold text-lg">{t('playlist.title')}</h3>
          {tracks.length > 0 && (
            <span className="text-xs text-muted bg-kbk-dark-800 px-2 py-0.5 rounded-full tabular-nums">
              {tracks.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Suche-Button */}
          {tracks.length > 0 && (
            <button
              onClick={toggleSearch}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer',
                searchOpen
                  ? 'text-rasta-green bg-rasta-green/10'
                  : 'text-muted hover:text-foreground bg-kbk-dark-800 hover:bg-kbk-dark-700'
              )}
              title={t('playlist.searchTracks')}
            >
              <Search size={14} />
            </button>
          )}

          {/* Dateien hinzufügen Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground bg-kbk-dark-800 hover:bg-kbk-dark-700 rounded-lg transition-colors cursor-pointer"
            title={t('playlist.addFiles')}
          >
            <Upload size={14} />
            <span className="hidden sm:inline">{t('playlist.files')}</span>
          </button>

          {/* Playlist leeren */}
          {tracks.length > 0 && (
            <button
              onClick={onClearPlaylist}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-rasta-red bg-kbk-dark-800 hover:bg-rasta-red/5 rounded-lg transition-colors cursor-pointer"
              title={t('playlist.clear')}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,audio/mpeg"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />
      </div>

      {/* Suchfeld (eingeklappt/ausgeklappt) */}
      {searchOpen && (
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('playlist.searchPlaceholder')}
              className="w-full pl-9 pr-8 py-2 text-sm bg-kbk-dark-800 border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-rasta-green/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-foreground cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-xs text-muted mt-1.5 px-1">
              {t('playlist.results', { count: filteredTracks.length })}
            </p>
          )}
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {isDragOver && (
        <div className="mx-4 mb-4 p-8 border-2 border-dashed border-rasta-green rounded-xl bg-rasta-green/5 text-center animate-pulse">
          <Upload size={32} className="mx-auto text-rasta-green mb-2" />
          <p className="text-rasta-green font-medium">{t('playlist.dropHere')}</p>
        </div>
      )}

      {/* Track-Liste */}
      <div className="px-3 pb-4 max-h-[400px] overflow-y-auto scrollbar-thin">
        {tracks.length > 0 ? (
          <ol className="space-y-0.5">
            {filteredTracks.map(({ track, originalIndex }) => (
              <li key={track.id}>
                <PlaylistItem
                  track={track}
                  index={originalIndex}
                  isActive={originalIndex === currentIndex}
                  isPlaying={originalIndex === currentIndex && isPlaying}
                  isPlayed={playedTrackIds.has(track.id)}
                  onPlay={() => onPlayTrack(originalIndex)}
                  onRemove={track.isLocal ? () => onRemoveTrack(track.id) : undefined}
                />
              </li>
            ))}
            {searchQuery && filteredTracks.length === 0 && (
              <li className="text-center py-6 text-muted text-sm">
                {t('playlist.noMatches', { query: searchQuery })}
              </li>
            )}
          </ol>
        ) : (
          // Leerer State
          <div
            className={cn(
              'text-center py-12 rounded-xl border-2 border-dashed transition-colors mx-1',
              isDragOver
                ? 'border-rasta-green bg-rasta-green/5'
                : 'border-border'
            )}
          >
            <Upload size={36} className="mx-auto text-muted mb-3" />
            <p className="text-muted font-medium mb-1">{t('playlist.empty')}</p>
            <p className="text-sm text-muted/70 mb-4">
              {t('playlist.emptyHint', { files: t('playlist.files') })}
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-rasta-green bg-rasta-green/10 hover:bg-rasta-green/20 rounded-lg transition-colors cursor-pointer"
            >
              <Upload size={16} />
              {t('playlist.selectFiles')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
