'use client';

/**
 * KBK TopNavBar — Sticky-Navigation mit Logo, Nav-Links, Live-Clock, JOIN-Button
 * und horizontalem Info-Ticker. Portiert aus neues Design KBK/app.jsx (Zeilen 95–162).
 *
 * Erweiterungen gegenüber Original:
 *  - Aktiver Pfad per usePathname() (statt hartkodiert HOME).
 *  - JOIN-Button wird zu MY PROFILE wenn Session vorhanden.
 *  - ADMIN-Badge bei Session-Role === 'ADMIN'.
 *  - Ticker liest Now-Playing aus usePlayer() (fallback "4FLOW — WOLF SEASON").
 *  - Responsiv: <md blendet Nav-Buttons aus und zeigt Hamburger-Panel.
 *
 * Inline-Styles sind bewusst beibehalten — das Design ist "so gewollt".
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { useServerTime } from '@/hooks/useServerTime';
import { IcoZap, IcoMenu, IcoX } from './icons';
import LocaleSwitcher from './LocaleSwitcher';

// Nav-Items — Hausparty-Klickwege (siehe Auto-Memory project_kbk_hausparty_konzept.md):
// HOME (Cockpit) / PACK (Pack-Page mit 4Flow-Bio + Crew) / LIBRARY / SCHEDULE / MISSION / LEARN.
// PACK linkt seit 26.04. auf /artists — die ehemalige /community-Wall wurde entfernt.
// MISSION (ADR-039, 16.07.2026): Mission-Board — Desktop UND Mobile ziehen aus
// derselben Konstante, ein Eintrag reicht fuer beide Breakpoints.
// Labels kommen seit i18n (ADR-031) aus dem nav-Namespace der Message-Kataloge.
// SHOWCASE (ADR-041, 24.07.2026): kuratierte externe Künstler — zeigt auf die
// Playlist-Übersicht mit der Showcase-Zone oben.
const NAV_ITEMS: { key: 'home' | 'pack' | 'showcase' | 'library' | 'schedule' | 'mission' | 'learn'; href: string }[] = [
  { key: 'home', href: '/' },
  { key: 'pack', href: '/artists' },
  { key: 'showcase', href: '/playlists' },
  { key: 'library', href: '/library' },
  { key: 'schedule', href: '/schedule' },
  { key: 'mission', href: '/mission' },
  { key: 'learn', href: '/learn/synthesizer' },
];

export default function TopNavBar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { data: session } = useSession();
  const player = usePlayer();
  const t = useTranslations('nav');

  // v2.9: zentrale Sign-Out-Aktion. signOut() invalidiert die NextAuth-Session,
  // egal ob der User-Record in der DB noch existiert (war v2.8 das Problem mit
  // MiniFlow — gelöscht in DB aber Browser-JWT noch valid).
  const handleSignOut = async () => {
    await signOut({ redirect: false });
    setMenuOpen(false);
    router.push('/');
  };

  // Live-Uhr — UTC, server-synced (v2.6). useServerTime kalibriert über
  // /api/time und ueberlebt verstellte Laptop-Uhren.
  const { now: serverNow } = useServerTime();

  // Mobile-Menu Open-State.
  const [menuOpen, setMenuOpen] = useState(false);

  // v2.9 (Mobile-Audit P3): ESC-Key + Tap-outside schließen das Mobile-Menu.
  // Plus Body-Scroll-Lock während offen, damit der Background nicht scrollt.
  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Click in der NavBar selbst (Header) wird ignoriert — der Hamburger-
      // Button wird ja gerade geklickt. Wir schließen nur wenn _ausserhalb_.
      if (target.closest('[data-kbk-navbar]')) return;
      setMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  // Ticker — ECHTE Daten aus APIs:
  //   /api/kbk/stats     -> aura24h + wolvesOnline
  //   /api/kbk/next-drop -> next event/slot (title + countdown)
  const [tickerStats, setTickerStats] = useState<{
    aura24h: number | null; // null = unter Vanity-Schwellwert → Ticker-Segment ausgeblendet
    wolves: number | null;
  }>({ aura24h: null, wolves: null });
  const [nextDrop, setNextDrop] = useState<{
    title: string;
    startsAt: string; // ISO
  } | null>(null);

  useEffect(() => {
    let alive = true;
    const loadStats = () => {
      if (document.hidden) return; // P0.6: verdeckter Tab pollt nicht
      fetch('/api/kbk/stats')
        .then((r) => r.json())
        .then((data) => {
          if (!alive) return;
          setTickerStats({
            aura24h: data.aura24h ?? null,
            wolves: data.wolvesOnline ?? null,
          });
        })
        .catch(() => {});
    };
    const loadDrop = () => {
      if (document.hidden) return; // P0.6: verdeckter Tab pollt nicht
      fetch('/api/kbk/next-drop')
        .then((r) => r.json())
        .then((data) => {
          if (!alive) return;
          setNextDrop(data && data.title ? data : null);
        })
        .catch(() => {});
    };
    loadStats();
    loadDrop();
    const sId = setInterval(loadStats, 30_000);
    const dId = setInterval(loadDrop, 30_000);
    // P0.6: Tab wieder sichtbar → sofort nachladen statt aufs Intervall zu warten.
    const onVis = () => { if (!document.hidden) { loadStats(); loadDrop(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(sId);
      clearInterval(dId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Live-Countdown zum nextDrop — nutzt server-synced t statt Date.now().
  // Damit ist der Countdown auch korrekt wenn Laptop-Uhr fehlerhaft ist.
  const countdownStr = useMemo(() => {
    if (!nextDrop || !serverNow) return '—';
    const ms = new Date(nextDrop.startsAt).getTime() - serverNow.getTime();
    if (ms <= 0) return 'NOW';
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins < 60)
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  }, [nextDrop, serverNow]);

  // Now-Playing-Text aus Player-Context.
  const current = player.audio.currentTrack;
  const nowSpinning = current
    ? `${current.title} — ${current.artist}`
    : '4FLOW — WOLF SEASON';

  // Admin-Role-Check (via session.user.role — getyped in src/types/next-auth.d.ts).
  const isLoggedIn = Boolean(session?.user);
  const isAdmin = session?.user?.role === 'ADMIN';
  const username = session?.user?.username;

  return (
    <div
      data-kbk-navbar="true"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        // Subtiler Vulkanglas-Touch (drei diagonale Schliff-Linien) über dem
        // schwarzen Grund — gleicher Approach wie MiniPlayer-Bottom-Bar, kein
        // Pseudo-Layer, damit blur + sticky intakt bleiben.
        background: `
          linear-gradient(118deg, transparent 28%, rgba(255,255,255,0.04) 28.3%, transparent 28.6%),
          linear-gradient(142deg, transparent 64%, rgba(255,255,255,0.05) 64.2%, transparent 64.5%),
          linear-gradient(95deg, transparent 41%, rgba(63,207,74,0.04) 41.2%, transparent 41.4%),
          rgba(10,11,12,0.9)
        `,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(63,207,74,0.25)',
      }}
    >
      {/* Row 1 — Logo / Nav / Live / JOIN */}
      <div
        className="kbk-navbar-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '10px 16px',
        }}
      >
        {/* Logo-Block — auf Mobile schrumpfbar, Subtitle wird ausgeblendet.
            aria-label trägt den vollen Namen, unabhängig davon, ob visuell die
            Lang- oder die Kurzform steht — Screenreader sollen nie „KBK" buchstabieren. */}
        <Link
          href="/"
          aria-label="KaboomKartell"
          className="kbk-navbar-logo"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            minWidth: 0,
            flexShrink: 1,
          }}
        >
          <div style={{ width: 32, height: 32, position: 'relative', flexShrink: 0 }}>
            <Image
              src="/images/logo-4flow.png"
              alt="KBK"
              width={32}
              height={32}
              style={{
                width: '100%',
                height: '100%',
                filter: 'drop-shadow(0 0 6px #3FCF4A)',
              }}
            />
          </div>
          <div
            className="kbk-navbar-brand"
            style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, minWidth: 0 }}
          >
            <span
              className="kbk-navbar-brand-name"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                fontWeight: 900,
                color: '#fff',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
              }}
            >
              {/* Auf schmalen Geräten die echte Abkürzung statt eines
                  abgeschnittenen „KABOOMK…" — kürzer UND lesbar. */}
              <span className="kbk-brand-full">
                KABOOM<span style={{ color: '#E63B2E' }}>KARTELL</span>
              </span>
              <span className="kbk-brand-short">
                K<span style={{ color: '#E63B2E' }}>B</span>K
              </span>
            </span>
            <span
              className="kbk-navbar-brand-tag"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'rgba(255,255,255,0.65)',
                letterSpacing: '0.2em',
                marginTop: 3,
                whiteSpace: 'nowrap',
              }}
            >
              BY 4FLOW // EST. 2026
            </span>
          </div>
        </Link>

        {/* Nav-Buttons (Desktop) — ab md sichtbar */}
        <nav
          className="hidden lg:flex"
          style={{ gap: 2, marginLeft: 20 }}
          aria-label="Main navigation"
        >
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.key}
                href={item.href}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: 11,
                  letterSpacing: '0.15em',
                  padding: '12px 14px',
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  transition: 'all 0.15s',
                  textDecoration: 'none',
                  background: active ? 'rgba(63,207,74,0.2)' : 'transparent',
                  border: `1px solid ${active ? '#3FCF4A' : 'transparent'}`,
                  color: active ? '#3FCF4A' : 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                }}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        {/* Right-Block — Live / Admin / JOIN / Hamburger */}
        <div
          className="kbk-navbar-right"
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {/* Sprach-Umschalter (Cookie-Locale, ADR-031) — auf allen Breakpoints sichtbar */}
          <LocaleSwitcher />

          {/* Live-Clock */}
          <div
            className="hidden lg:flex"
            style={{
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.65)',
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#E63B2E',
                animation: 'kk-pulse 1s infinite',
              }}
            />
            LIVE · {serverNow ? serverNow.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' }) : '--:--:--'} UTC
          </div>

          {/* Admin-Badge — 44px Touch-Target (WCAG 2.5.5).
              v2.26 (07.05.2026): Parallelogramm via skew(-15deg) Wrapper +
              reverse-skew Inner-Span. Border ist normaler CSS-Border und folgt
              automatisch der Schraege — Flow-Wunsch „Rahmen in Parallelogramm-Form".
              Click-Target umfasst die volle Schraege. */}
          {isAdmin && (
            <Link
              href="/admin"
              className="hidden lg:inline-flex"
              aria-label="Admin"
              style={{
                background: 'rgba(20,16,4,0.92)',
                border: '1px solid #F5D02E',
                color: '#F5D02E',
                textDecoration: 'none',
                flexShrink: 0,
                padding: '0 22px',
                minHeight: 44,
                alignItems: 'center',
                transform: 'skew(-15deg)',
                boxShadow: '0 0 14px rgba(245,208,46,0.35)',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  transform: 'skew(15deg)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: 10,
                  letterSpacing: '0.15em',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('admin')}
              </span>
            </Link>
          )}

          {/* v2.9: Sign-Out-Link auf Desktop (lg+) — diskret aber erreichbar
              ohne Hamburger-Menu. Mobile-User finden Sign-Out im Hamburger. */}
          {isLoggedIn && (
            <button
              type="button"
              onClick={handleSignOut}
              className="hidden lg:inline-flex"
              style={{
                background: 'transparent',
                color: 'rgba(255,255,255,0.55)',
                border: 'none',
                padding: '0 12px',
                minHeight: 44,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '0.2em',
                cursor: 'pointer',
                alignItems: 'center',
                whiteSpace: 'nowrap',
              }}
              title={t('signOut')}
            >
              {t('signOut')}
            </button>
          )}

          {/* JOIN / PROFILE Button — 44px Touch-Target.
              Auf Mobile: kompakter Text "JOIN" / "PROFILE", Icon klein,
              padding angepasst an clipPath-Diagonale (6px + 14px Innenabstand). */}
          <Link
            href={isLoggedIn && username ? `/profile/${username}` : '/register'}
            className="kbk-navbar-cta"
            style={{
              background: '#3FCF4A',
              color: '#0A0B0C',
              border: 'none',
              padding: '0 20px',
              minHeight: 44,
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: '0.1em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 0 16px rgba(63,207,74,0.5)',
              clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)',
              textDecoration: 'none',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <IcoZap size={16} />
            <span className="kbk-cta-full">
              {isLoggedIn ? t('myProfile') : t('joinThePack')}
            </span>
            <span className="kbk-cta-short">
              {isLoggedIn ? t('profileShort') : t('joinShort')}
            </span>
          </Link>

          {/* Hamburger (Mobile) — 44x44 Touch-Target (WCAG 2.5.5).
              minWidth + flexShrink:0 weil der Flex-Container den Button sonst
              auf content-width (~25px) zusammenstaucht, wenn der Logo-Block
              + JOIN-Button daneben den Platz beanspruchen. */}
          <button
            type="button"
            className="lg:hidden"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              width: 44,
              minWidth: 44,
              height: 44,
              flexShrink: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {menuOpen ? <IcoX size={16} /> : <IcoMenu size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile-Menu (eingeklappt) */}
      {menuOpen && (
        <div
          className="lg:hidden"
          style={{
            padding: '8px 16px 12px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {/* Admin-Link auf Mobile — Pille im Header ist auf <sm versteckt */}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMenuOpen(false)}
              style={{
                padding: '8px 10px',
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: '0.15em',
                color: '#F5D02E',
                background: 'rgba(245,208,46,0.1)',
                textDecoration: 'none',
              }}
            >
              {t('admin')}
            </Link>
          )}
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  padding: '8px 10px',
                  fontFamily: 'var(--font-display)',
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: '0.15em',
                  color: active ? '#3FCF4A' : '#fff',
                  background: active ? 'rgba(63,207,74,0.1)' : 'transparent',
                  textDecoration: 'none',
                }}
              >
                {t(item.key)}
              </Link>
            );
          })}

          {/* v2.9: Account-Section im Hamburger-Menu (Settings + Sign-Out)
              wenn eingeloggt — sonst nur SIGN IN-Link */}
          {isLoggedIn ? (
            <>
              <div style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    padding: '8px 10px',
                    fontFamily: 'var(--font-display)',
                    fontSize: 13,
                    fontWeight: 900,
                    letterSpacing: '0.15em',
                    color: '#fff',
                    textDecoration: 'none',
                  }}
                >
                  {t('settings')}
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  style={{
                    padding: '8px 10px',
                    fontFamily: 'var(--font-display)',
                    fontSize: 13,
                    fontWeight: 900,
                    letterSpacing: '0.15em',
                    color: '#E63B2E',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {t('signOut')}
                </button>
              </div>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                padding: '8px 10px',
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: '0.15em',
                color: '#3FCF4A',
                textDecoration: 'none',
              }}
            >
              {t('signIn')}
            </Link>
          )}
        </div>
      )}

      {/* Row 2 — Info-Ticker (aria-live=polite, damit Screenreader die Updates
          ankuendigen können aber nicht spam-mailen).
          Auf Mobile (<md) versteckt — die 5 Ticker-Items passen nicht in 412px
          und liefen vorher rechts ab. Now-Playing ist eh im Cockpit-Player +
          Marquee sichtbar. */}
      <div
        role="status"
        aria-live="polite"
        aria-label="KaboomKartell live ticker"
        className="hidden lg:flex"
        style={{
          padding: '4px 24px',
          gap: 12,
          borderTop: '1px solid rgba(255,255,255,0.04)',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'rgba(255,255,255,0.6)',
          letterSpacing: '0.15em',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: '#E63B2E', fontWeight: 900 }}>»»</span>
        <span>{t('ticker.nowSpinning')} <span style={{ color: '#fff' }}>{nowSpinning}</span></span>
        {/* Vanity-Gate: Aura-Segment nur, wenn echter Wert da ist (sonst „+0 aura"). */}
        {tickerStats.aura24h != null && (
          <>
            <span style={{ opacity: 0.4 }}>{'//'}</span>
            <span>{t('ticker.aura', { count: tickerStats.aura24h })}</span>
          </>
        )}
        <span style={{ opacity: 0.4 }}>{'//'}</span>
        <span>{t('ticker.nextDrop')} {nextDrop ? `${nextDrop.title} (${countdownStr})` : t('ticker.tbd')}</span>
        <span style={{ opacity: 0.4 }}>{'//'}</span>
        {/* Marken-Zeile bleibt bewusst unübersetzt (Slogan) */}
        <span style={{ color: '#F5D02E' }}>KABOOMKARTELL // MAKE NOISE TOGETHER</span>
        {/* Vanity-Gate: Wolfpack-Segment nur ab echtem Traffic (sonst „4 in the pack"). */}
        {tickerStats.wolves != null && (
          <>
            <span style={{ opacity: 0.4 }}>{'//'}</span>
            <span>{t('ticker.inThePack', { count: tickerStats.wolves })}</span>
          </>
        )}
      </div>
    </div>
  );
}
