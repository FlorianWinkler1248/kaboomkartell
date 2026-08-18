/**
 * RouteSkeleton — Ladegerüst für schwere Listen-Seiten.
 *
 * (18.08.2026) Die Wurzel-`loading.tsx` ersetzt bei jeder Navigation die
 * komplette Seite durch einen zentrierten Kreisel. Der Nutzer sieht dadurch
 * erst nichts und dann alles. Dieses Gerüst deutet stattdessen die Struktur
 * an, die gleich kommt — Titelzeile, dann Karten —, sodass der Seitenaufbau
 * als Fortsetzung wirkt und nicht als Sprung.
 *
 * Bewusst über `opacity` gepulst (Tailwind `animate-pulse`) und nicht über
 * `box-shadow`: Deckkraft läuft auf der Grafikeinheit, Schatten nicht. Genau
 * das war der Ruckel-Befund vom selben Tag. `prefers-reduced-motion` ist über
 * die Sammelregel in `globals.css` abgedeckt.
 */

interface Props {
  /** Anzahl der Karten-Platzhalter. */
  karten?: number;
  /** Höhe einer Karte in Pixeln. */
  kartenHoehe?: number;
  /** Rasterbreite je Karte — steuert ein- oder mehrspaltig. */
  spaltenBreite?: number;
}

export default function RouteSkeleton({
  karten = 8,
  kartenHoehe = 96,
  spaltenBreite = 260,
}: Props) {
  return (
    <section style={{ padding: '40px 24px' }} aria-hidden="true">
      {/* Titelzeile */}
      <div className="animate-pulse" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 6,
            background: 'rgba(63,207,74,0.16)',
          }}
        />
        <div
          style={{
            width: 220,
            height: 20,
            borderRadius: 4,
            background: 'rgba(255,255,255,0.10)',
          }}
        />
      </div>

      {/* Zeile darunter: Beschreibung + Zähler */}
      <div
        className="animate-pulse"
        style={{ display: 'flex', gap: 14, marginTop: 18, flexWrap: 'wrap' }}
      >
        <div
          style={{
            width: 'min(420px, 70%)',
            height: 13,
            borderRadius: 4,
            background: 'rgba(255,255,255,0.07)',
          }}
        />
        <div
          style={{
            width: 74,
            height: 22,
            borderRadius: 4,
            border: '1px solid rgba(63,207,74,0.25)',
          }}
        />
      </div>

      {/* Karten */}
      <div
        className="animate-pulse"
        style={{
          marginTop: 28,
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${spaltenBreite}px, 1fr))`,
          gap: 16,
        }}
      >
        {Array.from({ length: karten }).map((_, i) => (
          <div
            key={i}
            style={{
              height: kartenHoehe,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.035)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          />
        ))}
      </div>
    </section>
  );
}
