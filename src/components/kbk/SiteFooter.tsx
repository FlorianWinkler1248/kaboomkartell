'use client';

/**
 * SiteFooter — globaler Seiten-Footer auf allen öffentlichen Seiten.
 *
 * Client Component wegen `usePathname` (Admin-Ausschluss, gleiches Muster wie
 * MiniPlayer): der Admin-Bereich hat eine eigene Scroll-Shell mit `overflow-hidden`,
 * dort würde ein globaler Footer verschwinden/stören. Die externen Links kommen aus
 * der zentralen Quelle `@/lib/site-links`.
 *
 * Kein eigenes Bottom-Padding nötig: `body.kbk-has-miniplayer` reserviert bereits
 * Platz für den fixierten MiniPlayer, sodass er den Footer nicht verdeckt.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { GITHUB_REPO_URL, CONTACT_EMAIL, SOCIAL_LINKS } from '@/lib/site-links';

// Kanonische Marken-Schreibweise für den Footer (SOCIAL_LINKS.label ist für die
// Karten-Optik durchgängig Großbuchstaben; hier lesbarer).
const SOCIAL_DISPLAY: Record<string, string> = {
  soundcloud: 'SoundCloud',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  discord: 'Discord',
};

export default function SiteFooter() {
  const pathname = usePathname();
  const t = useTranslations('footer');

  if (pathname?.startsWith('/admin')) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="kbk-footer">
      <div className="kbk-footer-inner">
        <div className="kbk-footer-brand">
          <div className="kbk-footer-logo">KABOOMKARTELL</div>
          <p className="kbk-footer-tagline">{t('tagline')}</p>
          <p className="kbk-footer-copy">{t('copyright', { year })}</p>
        </div>

        <nav className="kbk-footer-group" aria-label={t('groupPlatform')}>
          <h2 className="kbk-footer-heading">{t('groupPlatform')}</h2>
          <Link href="/about" className="kbk-footer-link">{t('linkAbout')}</Link>
          <Link href="/schedule" className="kbk-footer-link">{t('linkSchedule')}</Link>
          <Link href="/library" className="kbk-footer-link">{t('linkLibrary')}</Link>
          <Link href="/artists" className="kbk-footer-link">{t('linkArtists')}</Link>
          <Link href="/learn" className="kbk-footer-link">{t('linkLearn')}</Link>
        </nav>

        <nav className="kbk-footer-group" aria-label={t('groupHelp')}>
          <h2 className="kbk-footer-heading">{t('groupHelp')}</h2>
          <Link href="/help" className="kbk-footer-link">{t('linkHelp')}</Link>
          <Link href="/imprint" className="kbk-footer-link">{t('linkImprint')}</Link>
          <Link href="/privacy" className="kbk-footer-link">{t('linkPrivacy')}</Link>
        </nav>

        <nav className="kbk-footer-group" aria-label={t('groupConnect')}>
          <h2 className="kbk-footer-heading">{t('groupConnect')}</h2>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="kbk-footer-link">
            GitHub
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="kbk-footer-link">
            {t('linkEmail')}
          </a>
          {SOCIAL_LINKS.map((s) => (
            <a
              key={s.id}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="kbk-footer-link"
            >
              {SOCIAL_DISPLAY[s.id] ?? s.label}
            </a>
          ))}
          <Link href="/mcp" className="kbk-footer-link">MCP</Link>
        </nav>
      </div>
    </footer>
  );
}
