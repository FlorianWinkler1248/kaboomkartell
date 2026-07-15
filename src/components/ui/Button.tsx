'use client';

import { forwardRef } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * Button-Komponente mit Obsidian-Optik (Vulkanglas + pulsierender Neon-Border).
 *
 * Varianten:
 * - primary:   Obsidian + grüner pulsierender Frame (Hauptaktion)
 * - secondary: Obsidian + grüner Text, kein Frame (subtle Aktion)
 * - danger:    Obsidian + roter pulsierender Frame (Löschen, Abbrechen)
 * - ghost:     Transparent, kein Obsidian (sehr subtle)
 */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const t = useTranslations('commonUi');
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          // Basis
          'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 cursor-pointer',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rasta-green',

          // Größe
          size === 'sm' && 'px-3 py-1.5 text-sm gap-1.5',
          size === 'md' && 'px-5 py-2.5 text-base gap-2',
          size === 'lg' && 'px-7 py-3.5 text-lg gap-2.5',

          // Varianten — primary/secondary/danger nutzen die Obsidian-Optik;
          // ghost bleibt transparent und unauffaellig.
          variant === 'primary' && 'kbk-obsidian polished framed text-white',
          variant === 'secondary' && 'kbk-obsidian polished text-rasta-green',
          variant === 'danger' && 'kbk-obsidian polished framed kbk-frame-red text-rasta-red-light',
          variant === 'ghost' && [
            'bg-transparent text-secondary',
            'hover:bg-kbk-dark-700 hover:text-foreground',
            'active:bg-kbk-dark-800',
          ],

          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>{t('loading')}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
