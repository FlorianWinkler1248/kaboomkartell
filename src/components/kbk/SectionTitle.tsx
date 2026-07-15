/**
 * KBK SectionTitle — Section-Header mit Sub-Nummer, Label + Titel.
 * Portiert aus neues Design KBK/app.jsx (Zeilen 320–333).
 *
 * Layout: links kleine Mono-Info "/01/ CONTROL DECK", mittige Linie als
 * Gradient, rechts die große Display-H2.
 *
 * Props:
 *  - sub:    Section-Index (z.B. "01")
 *  - label:  Section-Kategorie (z.B. "CONTROL DECK")
 *  - title:  Haupt-Ueberschrift (z.B. "THE COCKPIT")
 *  - accent: Farbakzent für die kleine Info-Zeile (default "green")
 */

type Accent = 'green' | 'red' | 'yellow';

interface Props {
  sub: string;
  label: string;
  title: string;
  accent?: Accent;
}

// Farbwerte für die drei Akzent-Varianten.
const ACCENT_HEX: Record<Accent, string> = {
  green: '#3FCF4A',
  red: '#E63B2E',
  yellow: '#F5D02E',
};

export function SectionTitle({
  sub,
  label,
  title,
  accent = 'green',
}: Props) {
  const c = ACCENT_HEX[accent];

  return (
    <div
      className="kbk-section-title"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 14,
        marginBottom: 4,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: c,
          letterSpacing: '0.2em',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        /{sub}/ {label}
      </span>
      <div
        className="kbk-section-title-line"
        style={{
          flex: 1,
          height: 1,
          background: `linear-gradient(90deg, ${c}40, transparent)`,
        }}
      />
      <h2
        className="kbk-section-title-h2"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: '-0.01em',
          color: '#fff',
          margin: 0,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </h2>
    </div>
  );
}
