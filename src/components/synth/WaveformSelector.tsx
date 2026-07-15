'use client';

/**
 * WaveformSelector — Wellenform-Auswahl Buttons
 *
 * Vier Buttons (Sine, Square, Sawtooth, Triangle) mit SVG-Icons
 * der jeweiligen Wellenform. Aktiver Button wird hervorgehoben.
 */

interface WaveformSelectorProps {
  /** Aktuell gewählte Wellenform */
  value: OscillatorType;
  /** Callback bei Änderung */
  onChange: (type: OscillatorType) => void;
  /** Optionales Label über der Auswahl */
  label?: string;
}

/** Wellenform-Typen mit Anzeigenamen */
const WAVEFORMS: { type: OscillatorType; name: string }[] = [
  { type: 'sine', name: 'Sine' },
  { type: 'square', name: 'Square' },
  { type: 'sawtooth', name: 'Saw' },
  { type: 'triangle', name: 'Triangle' },
];

/**
 * SVG-Icons für die vier Standard-Wellenformen.
 * ViewBox 48x28 — größer + mehr Detail als vorher (war 32x20).
 * Jede Kurve zeigt eine volle Periode, symmetrisch um die Mitte (y=14).
 */
function WaveformIcon({ type, active }: { type: OscillatorType; active: boolean }) {
  const color = active ? '#3FCF4A' : 'rgba(255,255,255,0.55)';
  const strokeWidth = active ? 2.2 : 1.7;

  return (
    <svg width="40" height="24" viewBox="0 0 48 28" fill="none" aria-hidden="true">
      {(() => {
        switch (type) {
          case 'sine':
            // Weiche Sinuskurve: volle Periode von 4 bis 44
            return (
              <path
                d="M 4 14 C 8 4, 16 4, 20 14 C 24 24, 32 24, 36 14 C 40 4, 44 4, 44 4"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            );
          case 'square':
            // Klassische Rechteck-Welle: Up-Peak + Down-Peak
            return (
              <path
                d="M 4 14 L 4 4 L 20 4 L 20 24 L 36 24 L 36 4 L 44 4"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            );
          case 'sawtooth':
            // Saegezahn: linearer Anstieg, senkrechter Fall
            return (
              <path
                d="M 4 24 L 20 4 L 20 24 L 36 4 L 36 24 L 44 14"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            );
          case 'triangle':
            // Dreieck: symmetrischer Anstieg und Abstieg
            return (
              <path
                d="M 4 14 L 12 4 L 28 24 L 40 4 L 44 10"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            );
          default:
            return null;
        }
      })()}
    </svg>
  );
}

export default function WaveformSelector({
  value,
  onChange,
  label,
}: WaveformSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span
          style={{
            color: 'rgba(255,255,255,0.55)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      )}

      {/* Grid-Layout: gleichmaessige Spalten, stretcht auf Container-Breite —
          4 columns auf allen Viewports (auf winzigen Screens werden die Buttons schmaler) */}
      <div className="grid grid-cols-4 gap-2">
        {WAVEFORMS.map(({ type, name }) => {
          const isActive = value === type;
          return (
            <button
              key={type}
              onClick={() => onChange(type)}
              className="kbk-obsidian polished"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 8px',
                minHeight: 68,
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'box-shadow 0.15s, color 0.15s',
                boxShadow: isActive
                  ? 'inset 0 0 0 1px rgba(63,207,74,0.55), 0 0 14px rgba(63,207,74,0.22)'
                  : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
              }}
              title={name}
              aria-pressed={isActive}
            >
              <WaveformIcon type={type} active={isActive} />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                  color: isActive ? '#3FCF4A' : 'rgba(255,255,255,0.55)',
                }}
              >
                {name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
