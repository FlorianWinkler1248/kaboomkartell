'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePlayer } from '@/components/providers/PlayerProvider';

/**
 * NowPlayingTicker — Schmaler Marquee-Ticker unter der Navbar
 *
 * Zeigt aktuellen Radio-Track (wenn Radio läuft) + Genre-Tags als
 * endlos scrollenden Ticker. Subtile Mono-Schrift, Neon-Green, geringe Opacity.
 *
 * Wird auf Admin-Routen und der /radio Full-Screen-Seite ausgeblendet
 * (dort ist ohnehin mehr Player-Info sichtbar).
 */

// Genre-Tags bleiben als Eigennamen literal (keine Übersetzung), die übrigen
// Slogans kommen aus dem i18n-Katalog.
const GENRE_TAGS = ['RAGGATEK', 'HARDTEK', 'PHONK'];

export default function NowPlayingTicker() {
  const pathname = usePathname();
  const t = useTranslations('playerUi');
  const { radioMode, audio } = usePlayer();

  // Auf Admin + /radio ausblenden
  if (pathname.startsWith('/admin') || pathname === '/radio') return null;

  const items: string[] = [];
  if (radioMode && audio.currentTrack) {
    items.push(`♪ ${t('nowPlayingPrefix')} · ${audio.currentTrack.title} — ${audio.currentTrack.artist}`);
  }
  items.push(
    ...GENRE_TAGS,
    t('tickerBassDrop'),
    t('tickerCartelVibes'),
    t('tickerMakeNoise'),
  );

  // 3x duplizieren für seamless-scroll (Shift -33.333%)
  const full = [...items, ...items, ...items];

  return (
    <div
      className="relative overflow-hidden border-y border-rasta-green/30 bg-kbk-black py-1"
      aria-hidden="true"
    >
      {/* Diagonaler Wrapper — skewY kippt den Inhalt, overflow-hidden maskiert die Ecken */}
      <div
        className="relative"
        style={{ transform: 'skewY(-1.5deg) rotate(-0.8deg)', transformOrigin: 'center' }}
      >
        <div className="animate-marquee flex gap-10 whitespace-nowrap py-1.5 font-mono text-[10px] tracking-[0.25em] text-rasta-green uppercase w-max">
          {full.map((item, i) => (
            <span key={i} className="flex items-center gap-2.5">
              <span className="inline-block w-1 h-1 rounded-full bg-rasta-green shrink-0 shadow-[0_0_6px_#3FCF4A]" />
              {item}
            </span>
          ))}
        </div>
      </div>
      {/* Fade-Masken links + rechts für sauberen Loop-Rand */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-kbk-black to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-kbk-black to-transparent" />
    </div>
  );
}
