/**
 * KBK Marquee — horizontal scrollender Genre-Ticker, rot geskewed.
 * Portiert aus neues Design KBK/app.jsx (Zeilen 243–259).
 *
 * Trick: Outer div skewY(-1deg), Inner div kontra-skewY(1deg) — dadurch
 * kippt nur der Hintergrund schraeg, die Schrift bleibt grade.
 * Animation kk-marquee ist in globals.css definiert (30s linear infinite).
 *
 * Server Component (async) — i18n via getTranslations. Markenbegriffe
 * (Genre-Namen, KABOOMKARTELL, KBK) bleiben unübersetzt, nur die Schlagwort-
 * Items (UNDERGROUND, PARTY, …) laufen durch den Catalog.
 */

import { getTranslations } from 'next-intl/server';

export default async function Marquee() {
  const t = await getTranslations('home.marquee');

  // Markenbegriffe NIE übersetzen — Genre-Namen + KABOOMKARTELL + KBK fest.
  // Übersetzbare Schlagworte kommen aus dem Catalog.
  const ITEMS = [
    '★ RAGGATEK ★',
    '★ HARDTEK ★',
    '★ PHONK ★',
    '★ KABOOMKARTELL ★',
    `★ ${t('underground')} ★`,
    `★ ${t('party')} ★`,
    `★ ${t('nonStopMusic')} ★`,
    `★ ${t('aiTransparency')} ★`,
    `★ ${t('becomeAWolf')} ★`,
    '★ KBK ★',
  ];

  // 3x dupliziert weil die CSS-Animation zu -33.333% translatet (nahtloser Loop).
  const TRACK = [...ITEMS, ...ITEMS, ...ITEMS];

  return (
    <div
      className="kbk-marquee"
      style={{
        background: '#E63B2E',
        color: '#0A0B0C',
        padding: '10px 0',
        overflow: 'hidden',
        borderTop: '2px solid #000',
        borderBottom: '2px solid #000',
        transform: 'skewY(-1deg)',
        margin: '0 -8px',
        // Soft-Mask an beiden Seiten — kein harter Cut mehr beim Marquee-Loop
        WebkitMaskImage:
          'linear-gradient(to right, transparent 0, #000 6%, #000 94%, transparent 100%)',
        maskImage:
          'linear-gradient(to right, transparent 0, #000 6%, #000 94%, transparent 100%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          animation: 'kk-marquee 30s linear infinite',
          whiteSpace: 'nowrap',
          transform: 'skewY(1deg)',
          willChange: 'transform',
        }}
      >
        {TRACK.map((x, i) => (
          <span
            key={i}
            className="kbk-marquee-item"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 20,
              letterSpacing: '0.15em',
              padding: '0 20px',
            }}
          >
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}
