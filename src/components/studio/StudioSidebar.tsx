'use client';

/**
 * Studio-Sidebar (ADR-041)
 *
 * Navigationsleiste für das Artist-Studio — Klon des AdminSidebar-Musters:
 * - Desktop (>= lg): feste Sidebar links, volle verfügbare Höhe über h-full,
 *   interner Scroll-Container falls die Linkliste wächst.
 * - Mobile (< lg): ausklappbares Overlay mit Hamburger-Toggle.
 *
 * Der Parent (StudioLayout) hält die Gesamthöhe fest — die Sidebar füllt nur aus.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  UserRound,
  Music2,
  Upload,
  ChevronLeft,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STUDIO_LINKS = [
  { href: '/studio', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/studio/profile', label: 'My Profile', icon: UserRound },
  { href: '/studio/tracks', label: 'My Tracks', icon: Music2 },
  { href: '/studio/upload', label: 'Upload', icon: Upload },
];

export default function StudioSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <>
      {/* Zurück-Link */}
      <Link
        href="/"
        className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors mb-4"
        onClick={() => setMobileOpen(false)}
      >
        <ChevronLeft size={16} />
        Back to Site
      </Link>

      {/* Studio-Titel — Mono-Kicker im Public-Signature-Stil */}
      <h2 className="px-3 font-mono text-[10px] tracking-[0.25em] uppercase text-rasta-green/80 mb-3">
        ARTIST STUDIO
      </h2>

      {/* Navigation */}
      <nav className="space-y-1">
        {STUDIO_LINKS.map((link) => {
          const isActive = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href);
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'text-rasta-green bg-rasta-green/10 border border-rasta-green/30 text-glow-green'
                  : 'text-secondary border border-transparent hover:text-foreground hover:bg-elevated hover:border-rasta-green/40'
              )}
            >
              <Icon size={18} />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile Toggle-Button (nur sichtbar auf kleinen Screens) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-4 left-4 z-40 p-3 bg-rasta-green text-white rounded-full shadow-lg hover:bg-rasta-green-light transition-colors cursor-pointer"
        aria-label="Open studio menu"
      >
        <Menu size={20} />
      </button>

      {/* Desktop-Sidebar (versteckt auf Mobile) — Mechanik wie AdminSidebar */}
      <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 h-full border-r border-border kbk-obsidian overflow-y-auto">
        <div className="p-4">{navContent}</div>
      </aside>

      {/* Mobile-Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Slide-in Panel */}
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-surface border-r border-border p-4 shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-mono text-[10px] tracking-[0.25em] uppercase text-rasta-green/80">Studio</h2>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors cursor-pointer"
                aria-label="Close studio menu"
              >
                <X size={18} />
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
