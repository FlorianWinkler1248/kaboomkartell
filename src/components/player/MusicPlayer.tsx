'use client';

/**
 * MusicPlayer - Orchestrator-Komponente
 *
 * Nutzt den globalen PlayerProvider-Context für Audio und Playlist.
 * Dadurch bleibt der State erhalten wenn zwischen Seiten navigiert wird
 * und der MiniPlayer kann den aktuellen Track anzeigen.
 *
 * Komponenten-Baum:
 * MusicPlayer
 * ├── NowPlaying (Titel, Cover, Künstler)
 * ├── ProgressBar (klickbar, Rasta-Gradient-Fill)
 * ├── PlayerControls (Prev, Play/Pause, Next, Shuffle, Repeat)
 * ├── VolumeControl (Slider + Mute)
 * ├── PlayerStats (Gesamt, Gespielt, Dauer)
 * └── Playlist (Track-Liste + Drag & Drop)
 *
 * Die Warteschlange kommt ausschliesslich aus dem Context — die Seite befuellt
 * sie nicht von selbst. Lokale Dateien lassen sich per Drag & Drop anhaengen.
 */

import { useCallback } from 'react';
import { usePlayer } from '@/components/providers/PlayerProvider';
import NowPlaying from './NowPlaying';
import ProgressBar from './ProgressBar';
import PlayerControls from './PlayerControls';
import VolumeControl from './VolumeControl';
import PlayerStats from './PlayerStats';
import Playlist from './Playlist';
import SoundCloudEmbed from './SoundCloudEmbed';
import VotingDialog from './VotingDialog';
import type { PlayerTrack } from '@/types';

export default function MusicPlayer() {
  // === Globaler Player-Context ===
  const {
    audio,
    playlist,
    playTrackAtIndex,
    handleTogglePlay,
    handleNext,
    handlePrev,
    activeSoundcloudTrack,
    removeFromQueue,
    showVotingDialog,
    dismissVotingDialog,
    onVoteSubmitted,
  } = usePlayer();

  // === Playlist-Track anklicken ===
  const handlePlaylistTrackClick = useCallback(
    (index: number) => {
      if (index === playlist.currentIndex && audio.isPlaying) {
        audio.pause();
      } else if (index === playlist.currentIndex) {
        audio.resume();
      } else {
        playTrackAtIndex(index);
      }
    },
    [playlist.currentIndex, audio, playTrackAtIndex]
  );

  // === Neue Tracks hinzufügen (Drag & Drop) ===
  const handleAddTracks = useCallback(
    (newTracks: PlayerTrack[]) => {
      playlist.addTracks(newTracks);

      // Wenn noch nichts läuft, ersten neuen Track starten
      if (!audio.currentTrack && playlist.tracks.length === 0 && newTracks.length > 0) {
        // setCurrentIndex und play nach kurzem Delay (damit State aktualisiert ist)
        setTimeout(() => {
          playlist.setCurrentIndex(0);
          playlist.markAsPlayed(newTracks[0].id);
          audio.play(newTracks[0]);
        }, 50);
      }
    },
    [playlist, audio]
  );

  // === Aktueller Track (für VotingDialog) ===
  const currentTrack = audio.currentTrack ?? activeSoundcloudTrack;

  // === Berechnung: Gibt es Prev/Next? ===
  const hasNext = playlist.getNextIndex() !== null;
  const hasPrev = playlist.currentIndex > 0 || playlist.repeatMode === 'all' || playlist.shuffleEnabled;
  const hasTrack = playlist.tracks.length > 0;

  return (
    <div className="rounded-xl bg-surface border border-border overflow-hidden shadow-xl shadow-black/20 relative">
      {/* === Voting-Dialog (erscheint nach 60s Hörzeit) === */}
      {showVotingDialog && currentTrack && (
        <VotingDialog
          trackId={currentTrack.id}
          trackTitle={currentTrack.title}
          onVoteSubmitted={onVoteSubmitted}
          onDismiss={dismissVotingDialog}
        />
      )}

      {/* === Now Playing + Progress/Embed === */}
      <div className="p-6 border-b border-border">
        <NowPlaying
          track={audio.currentTrack ?? activeSoundcloudTrack}
          isPlaying={audio.isPlaying}
        />

        {activeSoundcloudTrack ? (
          <div className="mt-4">
            <SoundCloudEmbed
              embedUrl={activeSoundcloudTrack.soundcloudEmbedUrl!}
              trackTitle={activeSoundcloudTrack.title}
              soundcloudUrl={activeSoundcloudTrack.url}
            />
          </div>
        ) : (
          <ProgressBar
            currentTime={audio.currentTime}
            duration={audio.duration}
            onSeek={audio.seek}
          />
        )}
      </div>

      {/* === Controls + Volume === */}
      <div className="p-4 border-b border-border">
        <PlayerControls
          isPlaying={audio.isPlaying}
          shuffleEnabled={playlist.shuffleEnabled}
          repeatMode={playlist.repeatMode}
          hasTrack={hasTrack}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onTogglePlay={handleTogglePlay}
          onPrev={handlePrev}
          onNext={handleNext}
          onToggleShuffle={playlist.toggleShuffle}
          onCycleRepeat={playlist.cycleRepeatMode}
        />

        {/* Volume + Stats in einer Zeile */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-border/50">
          <VolumeControl
            volume={audio.volume}
            onVolumeChange={audio.setVolume}
          />
          <PlayerStats stats={playlist.stats} />
        </div>
      </div>

      {/* === Playlist === */}
      <Playlist
        tracks={playlist.tracks}
        currentIndex={playlist.currentIndex}
        isPlaying={audio.isPlaying}
        playedTrackIds={playlist.playedTrackIds}
        onPlayTrack={handlePlaylistTrackClick}
        onAddTracks={handleAddTracks}
        onRemoveTrack={removeFromQueue}
        onClearPlaylist={playlist.clearPlaylist}
      />
    </div>
  );
}
