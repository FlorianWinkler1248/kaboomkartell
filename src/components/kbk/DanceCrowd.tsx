/**
 * DanceCrowd — Boomys Publikum: Tänzer-Reihen HINTEREINANDER gestaffelt.
 *
 * Reihen werden von hinten nach vorn gerendert und überlappen vertikal
 * (negatives marginTop), hintere Reihen sind kleiner + abgedunkelt —
 * echte Crowd-Tiefe statt aufgereihter Kette. Die Front-Row trägt die
 * wiedererkennbaren Originale. Bob-Delays sind gestaffelt.
 *
 * Regel (Workflow kbk-dance-sprites): jeder Charakter erscheint auf der
 * ganzen Seite nur EINMAL — die Crowd-Belegung lebt zentral in page.tsx.
 * Rein dekorativ (DanceSprite ist aria-hidden), wrappt auf schmalen Screens.
 */

import DanceSprite, { type DanceSpriteName } from './DanceSprite';

interface Props {
  /** Reihen von HINTEN nach VORN; letzte Reihe = Front-Row. */
  rows: readonly (readonly DanceSpriteName[])[];
  /** Sprite-Größe der Front-Row (hintere Reihen skalieren herunter). Default 72. */
  frontSize?: number;
}

export default function DanceCrowd({ rows, frontSize = 72 }: Props) {
  const n = rows.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {rows.map((row, ri) => {
        // hinten klein + dunkel, vorn groß + voll — 4 Reihen ≈ 0.6/0.73/0.86/1.0
        const depth = n <= 1 ? 1 : 0.6 + 0.4 * (ri / (n - 1));
        const size = Math.round(frontSize * depth);
        return (
          <div
            key={ri}
            style={{
              display: 'flex',
              gap: `clamp(10px, ${1.5 + ri}vw, ${16 + ri * 6}px)`,
              justifyContent: 'center',
              alignItems: 'flex-end',
              flexWrap: 'wrap',
              // Reihen überlappen: Köpfe der hinteren Reihe schauen zwischen
              // den vorderen hervor (klassisches Crowd-Staffeln).
              marginTop: ri === 0 ? 0 : -Math.round(size * 0.5),
              position: 'relative',
              zIndex: ri + 1,
              filter: `brightness(${0.62 + 0.38 * (ri / Math.max(1, n - 1))})`,
            }}
          >
            {row.map((name, i) => (
              <DanceSprite
                key={name}
                name={name}
                size={size}
                bobDelayMs={(ri * 3 + i) * -310}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
