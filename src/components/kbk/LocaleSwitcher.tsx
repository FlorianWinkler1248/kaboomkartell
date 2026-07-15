'use client';

/**
 * LocaleSwitcher — Sprach-Umschalter (Cookie-basiert, ADR-031).
 *
 * Setzt das kbk-locale-Cookie und refresht die Server-Components —
 * keine URL-Änderung (bewusste Entscheidung: bestehende Links bleiben
 * stabil). Kompakte Globe-Pille im Navbar-Stil, Dropdown mit den vier
 * Sprachen aus src/i18n/config.ts.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from '@/i18n/config';

// Außerhalb der Komponente: Cookie-Write ist ein External-System-Effekt,
// kein React-State (react-hooks/immutability greift sonst im Handler).
function setLocaleCookie(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
}

export default function LocaleSwitcher() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('locale');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Outside-Click + ESC schließen das Dropdown (gleiches Muster wie Mobile-Menu).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const select = (next: Locale) => {
    setLocaleCookie(next);
    setOpen(false);
    router.refresh();
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('label')}
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.2)',
          color: 'rgba(255,255,255,0.7)',
          padding: '0 10px',
          minHeight: 44,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.15em',
          cursor: 'pointer',
          textTransform: 'uppercase',
        }}
      >
        <Globe size={13} />
        {locale.toUpperCase()}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t('label')}
          className="kbk-obsidian"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 120,
            minWidth: 140,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            overflow: 'hidden',
          }}
        >
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitem"
              onClick={() => select(l)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                gap: 10,
                padding: '10px 12px',
                background: l === locale ? 'rgba(63,207,74,0.12)' : 'transparent',
                border: 'none',
                color: l === locale ? '#3FCF4A' : 'rgba(255,255,255,0.8)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>{LOCALE_LABELS[l]}</span>
              <span style={{ opacity: 0.5, fontSize: 9 }}>{l.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
