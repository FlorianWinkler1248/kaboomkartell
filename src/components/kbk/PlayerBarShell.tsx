'use client';

/**
 * PlayerBarShell — der gemeinsame Rahmen der unteren Leiste.
 *
 * KBK hat zwei Wiedergabe-Welten (Radio / Player), aber nur EINEN Platz am
 * unteren Bildschirmrand. Beide Gesichter teilen sich deshalb diesen Rahmen:
 * Vulkanglas-Grund, Equalizer-Hintergrund, Akzent-Kante, Safe-Area.
 *
 * Der Rahmen kennt keine Wiedergabe-Logik — er weiß nur, welche Farbe gerade
 * gilt und ob der Equalizer schwingen soll. So kann die Player-Leiste die
 * Radio-Leiste vollständig überschreiben, ohne dass die Optik springt.
 */

import PlayerBackgroundEqualizer from '@/components/player/PlayerBackgroundEqualizer';

interface PlayerBarShellProps {
  /** Akzentfarbe (Channel-Farbe im Radio, Player-Akzent im Player-Modus). */
  accent: string;
  /** Farbe der Equalizer-Balken. */
  equalizerColor: string;
  getFrequencyData: () => Uint8Array;
  /** Schwingt der Equalizer? (nur wenn hörbar etwas läuft) */
  isActive: boolean;
  /** Vorgelagerter Inhalt über der Bedienzeile (z.B. Warteschlangen-Klappe). */
  above?: React.ReactNode;
  regionLabel: string;
  children: React.ReactNode;
}

export default function PlayerBarShell({
  accent,
  equalizerColor,
  getFrequencyData,
  isActive,
  above,
  regionLabel,
  children,
}: PlayerBarShellProps) {
  return (
    <div
      role="region"
      aria-label={regionLabel}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: `
          linear-gradient(118deg, transparent 28%, rgba(255,255,255,0.04) 28.3%, transparent 28.6%),
          linear-gradient(142deg, transparent 64%, rgba(255,255,255,0.05) 64.2%, transparent 64.5%),
          linear-gradient(95deg, transparent 41%, rgba(63,207,74,0.04) 41.2%, transparent 41.4%),
          rgba(10,11,12,0.85)
        `,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: `1px solid ${accent}40`,
        boxShadow: `0 -4px 24px rgba(0,0,0,0.6), 0 -1px 0 ${accent}20`,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        overflow: 'hidden',
      }}
    >
      {/* Equalizer deckt exakt die zentrierte Content-Box ab — sonst quellen die
          Balken auf breiten Bildschirmen seitlich aus dem Inhalt heraus. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 1400,
          pointerEvents: 'none',
        }}
      >
        <PlayerBackgroundEqualizer
          getFrequencyData={getFrequencyData}
          isActive={isActive}
          accentColor={equalizerColor}
          barCount={56}
        />
      </div>

      {above}
      {children}
    </div>
  );
}
