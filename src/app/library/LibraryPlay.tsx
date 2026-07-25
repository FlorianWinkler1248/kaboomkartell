'use client';

/**
 * LibraryPlay — direkte Wiedergabe aus der Bibliothek (ADR-041-Nachschlag).
 *
 * Vorher war der „Play"-Pfeil in der Library nur ein Link auf die Track-
 * Detail-Seite (Abnahme-Feedback Flow 25.07.: „Wiedergabe von einzelnen
 * Liedern ist nicht zu finden"). Jetzt: echter Sofort-Play.
 *
 * Pattern: EIN Queue-Context pro Seite (die 25 sichtbaren LOCAL-Tracks,
 * einmal serialisiert), SSR-Zeilen bleiben Server-Markup — nur der Button
 * pro Zeile ist Client. Wiedergabe über playTracks() (kein Stale-Read).
 */

import { createContext, useContext } from 'react';
import { usePlayer } from '@/components/providers/PlayerProvider';
import type { PlayerTrack } from '@/types';

const QueueCtx = createContext<PlayerTrack[]>([]);

export function LibraryQueue({
  tracks,
  children,
}: {
  tracks: PlayerTrack[];
  children: React.ReactNode;
}) {
  return <QueueCtx.Provider value={tracks}>{children}</QueueCtx.Provider>;
}

/** Play-/Pause-Button einer Library-Zeile (Queue = sichtbare Seite). */
export function LibraryRowPlay({
  index,
  playLabel,
  pauseLabel,
}: {
  index: number;
  playLabel: string;
  pauseLabel: string;
}) {
  const queue = useContext(QueueCtx);
  const { playTracks, audio } = usePlayer();
  const track = queue[index];
  const isCurrent = !!track && audio.currentTrack?.id === track.id;
  const isPlaying = isCurrent && audio.isPlaying;

  const handleClick = () => {
    if (!track) return;
    if (isPlaying) {
      audio.pause();
    } else if (isCurrent) {
      audio.resume();
    } else {
      playTracks(queue, index);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isPlaying ? pauseLabel : playLabel}
      title={isPlaying ? pauseLabel : playLabel}
      aria-pressed={isPlaying}
      style={{
        width: 44,
        height: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isCurrent ? 'rgba(63,207,74,0.15)' : 'transparent',
        border: `1px solid ${isCurrent ? '#3FCF4A' : 'rgba(63,207,74,0.3)'}`,
        color: '#3FCF4A',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {isPlaying ? (
        <span aria-hidden="true" style={{ display: 'inline-flex', gap: 3 }}>
          <span style={{ width: 4, height: 14, background: '#3FCF4A' }} />
          <span style={{ width: 4, height: 14, background: '#3FCF4A' }} />
        </span>
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 0,
            height: 0,
            borderLeft: '9px solid #3FCF4A',
            borderTop: '6px solid transparent',
            borderBottom: '6px solid transparent',
            marginLeft: 2,
            filter: 'drop-shadow(0 0 4px rgba(63,207,74,0.5))',
          }}
        />
      )}
    </button>
  );
}

/** „Play All"-CTA über der Liste — spielt die sichtbare (gefilterte) Seite. */
export function LibraryPlayAll({ label }: { label: string }) {
  const queue = useContext(QueueCtx);
  const { playTracks } = usePlayer();
  if (queue.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => playTracks(queue, 0)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: '#3FCF4A',
        color: '#0A0B0C',
        border: 'none',
        padding: '10px 18px',
        minHeight: 44,
        fontFamily: 'var(--font-display)',
        fontWeight: 900,
        fontSize: 12,
        letterSpacing: '0.15em',
        cursor: 'pointer',
        clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
        textTransform: 'uppercase',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 0,
          height: 0,
          borderLeft: '10px solid #0A0B0C',
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent',
        }}
      />
      {label} ({queue.length})
    </button>
  );
}
