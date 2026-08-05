'use client';

/**
 * PlayerQueueDrawer — die Warteschlange über der Player-Leiste.
 *
 * Zeigt, was läuft und was kommt, und lässt beides ändern: anspringen,
 * verschieben, entfernen. Bewusst als Klappe über der Leiste statt als eigene
 * Seite — wer die Reihenfolge ändert, will dabei weiterhören.
 *
 * Umsortiert wird über Knöpfe statt Drag & Drop: das funktioniert mit Finger,
 * Maus und Tastatur gleichermaßen — und ist damit die einzige Art, die
 * Reihenfolge zu ändern (die Vollbild-Ansicht nimmt per Drag & Drop nur neue
 * Dateien entgegen, sie sortiert nicht um).
 */

import { useTranslations } from 'next-intl';
import { usePlayer } from '@/components/providers/PlayerProvider';

interface PlayerQueueDrawerProps {
  accent: string;
  onClose: () => void;
}

export default function PlayerQueueDrawer({ accent, onClose }: PlayerQueueDrawerProps) {
  const t = useTranslations('player');
  const { playlist, playTrackAtIndex, removeFromQueue } = usePlayer();
  const nextUp = playlist.upNext[0] ?? null;

  const rowButton: React.CSSProperties = {
    width: 30,
    height: 30,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.18)',
    color: 'rgba(255,255,255,0.75)',
    cursor: 'pointer',
    flexShrink: 0,
  };

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 10,
        maxWidth: 1400,
        margin: '0 auto',
        borderBottom: `1px solid ${accent}33`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px 6px',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.18em',
            color: accent,
            margin: 0,
          }}
        >
          {t('queue.title')} · {playlist.tracks.length}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('queue.close')}
          title={t('queue.close')}
          style={{ ...rowButton, width: 32, height: 32 }}
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* „Als Nächstes" ist im Shuffle die einzige ehrliche Auskunft: die Liste
          unten steht in Listen-Reihenfolge, gespielt wird aber die gemischte. */}
      {nextUp && (
        <p
          style={{
            padding: '0 14px 8px',
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.6)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {t('queue.upNext', { title: nextUp.title })}
        </p>
      )}

      {playlist.tracks.length === 0 ? (
        <p
          style={{
            padding: '0 14px 12px',
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          {t('queue.empty')}
        </p>
      ) : (
        <ol
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '0 8px 10px',
            // Höhe gedeckelt: die Klappe darf nie den ganzen Bildschirm fressen.
            maxHeight: '42vh',
            overflowY: 'auto',
          }}
        >
          {playlist.tracks.map((track, index) => {
            const isCurrent = index === playlist.currentIndex;
            return (
              <li
                key={`${track.id}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 6px',
                  background: isCurrent ? `${accent}1f` : 'transparent',
                  borderLeft: `2px solid ${isCurrent ? accent : 'transparent'}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => playTrackAtIndex(index)}
                  aria-current={isCurrent ? 'true' : undefined}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: isCurrent ? '#fff' : 'rgba(255,255,255,0.8)',
                    cursor: 'pointer',
                    padding: '6px 2px',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-display)',
                      fontSize: 12,
                      fontWeight: isCurrent ? 900 : 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isCurrent && (
                      <span style={{ color: accent, marginRight: 6 }} aria-label={t('queue.nowPlaying')}>
                        ▶
                      </span>
                    )}
                    {track.title}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      letterSpacing: '0.12em',
                      color: 'rgba(255,255,255,0.55)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {track.artist}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => playlist.moveTrack(index, index - 1)}
                  disabled={index === 0}
                  aria-label={t('queue.moveUp', { title: track.title })}
                  title={t('queue.moveUp', { title: track.title })}
                  style={{ ...rowButton, opacity: index === 0 ? 0.3 : 1 }}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => playlist.moveTrack(index, index + 1)}
                  disabled={index === playlist.tracks.length - 1}
                  aria-label={t('queue.moveDown', { title: track.title })}
                  title={t('queue.moveDown', { title: track.title })}
                  style={{ ...rowButton, opacity: index === playlist.tracks.length - 1 ? 0.3 : 1 }}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path d="M12 5v14M19 12l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeFromQueue(track.id)}
                  aria-label={t('queue.remove', { title: track.title })}
                  title={t('queue.remove', { title: track.title })}
                  style={rowButton}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
