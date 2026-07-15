'use client';

/**
 * Admin-UI-Primitives — Obsidian/Vulkanglas-Look für den Admin-Bereich.
 *
 * Warum eigene Primitives statt src/components/ui/{Card,Button}:
 *   - ui/Button hängt an next-intl ('commonUi'); der Admin-Baum liegt
 *     außerhalb des [locale]-Routings und ist bewusst EN-only.
 *   - Admin braucht dichtere Größen (Toolbars, Tabellen) als die Public-Seite.
 *
 * Die Optik kommt komplett aus globals.css: .kbk-obsidian (Vulkanglas),
 * .framed (pulsierender Neon-Border), .kbk-frame-{green,yellow,red}.
 * Regel für ruhige Flächen: Cards default OHNE frame, Akzent nur gezielt
 * (Warnzustände, die eine Haupt-Card pro Seite).
 */

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/** Einheitliche Formular-Klassen — überall im Admin für <input>/<textarea>. */
export const adminInputClass =
  'px-3 py-2 text-sm bg-kbk-dark-800/80 border border-border rounded-lg ' +
  'text-foreground placeholder:text-muted outline-none transition-colors ' +
  'focus:border-rasta-green/60 focus:shadow-[0_0_12px_rgba(63,207,74,0.12)]';

/** Einheitliche Formular-Klasse für <select>. */
export const adminSelectClass = cn(adminInputClass, 'cursor-pointer');

interface AdminPageHeaderProps {
  /** Mono-Kicker über dem Titel, z. B. "TRACK CONTROL" */
  kicker: string;
  /** Kurz-Tag im Kicker, z. B. "/T/" — gedimmt vorangestellt */
  kickerTag?: string;
  title: string;
  description?: string;
  /** Rechte Seite der Kopfzeile (Buttons etc.) */
  actions?: React.ReactNode;
}

/** Seiten-Kopf im Public-Signature-Stil (Mono-Kicker + Display-Font + Glow). */
export function AdminPageHeader({
  kicker,
  kickerTag,
  title,
  description,
  actions,
}: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-rasta-green mb-1.5">
          {kickerTag && <span className="opacity-60">{kickerTag} </span>}
          {kicker}
        </p>
        <h1 className="font-display text-2xl sm:text-3xl tracking-wider text-rasta-green text-glow-green">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-secondary mt-2 max-w-xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

interface AdminCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Pulsierender Neon-Border — sparsam einsetzen (Akzent, Warnzustand). */
  framed?: boolean;
  /** Frame-Farbe, nur zusammen mit framed. Default grün. */
  frame?: 'green' | 'yellow' | 'red';
  padding?: 'none' | 'sm' | 'md';
}

/** Obsidian-Card — Standard-Baustein für alle Admin-Flächen. */
export function AdminCard({
  framed = false,
  frame = 'green',
  padding = 'md',
  className,
  children,
  ...props
}: AdminCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl kbk-obsidian',
        framed && 'framed',
        framed && frame === 'yellow' && 'kbk-frame-yellow',
        framed && frame === 'red' && 'kbk-frame-red',
        padding === 'sm' && 'p-4',
        padding === 'md' && 'p-4 sm:p-5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface AdminButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

/**
 * Obsidian-Button in Admin-Dichte.
 *   primary   grüner Puls-Frame (Hauptaktion)
 *   secondary Obsidian, grüner Text, kein Frame
 *   accent    gelber Puls-Frame (Neben-Hauptaktion, ersetzt die alten
 *             Orange/Lila/Blau-Streuner)
 *   danger    roter Puls-Frame (destruktiv)
 *   ghost     transparent
 */
export const AdminButton = forwardRef<HTMLButtonElement, AdminButtonProps>(
  (
    { className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 cursor-pointer',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rasta-green',

          size === 'sm' && 'px-3 py-1.5 text-xs gap-1.5',
          size === 'md' && 'px-4 py-2 text-sm gap-2',
          size === 'lg' && 'px-5 py-2.5 text-base gap-2',

          variant === 'primary' && 'kbk-obsidian polished framed text-white',
          variant === 'secondary' && 'kbk-obsidian polished text-rasta-green',
          variant === 'accent' &&
            'kbk-obsidian polished framed kbk-frame-yellow text-rasta-yellow',
          variant === 'danger' &&
            'kbk-obsidian polished framed kbk-frame-red text-rasta-red-light',
          variant === 'ghost' && [
            'bg-transparent text-secondary',
            'hover:bg-kbk-dark-700 hover:text-foreground',
            'active:bg-kbk-dark-800',
          ],

          className
        )}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

AdminButton.displayName = 'AdminButton';
