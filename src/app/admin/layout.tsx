'use client';

/**
 * Admin-Layout
 *
 * Scroll-Containment-Shell für den Admin-Bereich.
 *
 * Regel (Flows Design-Prinzip):
 * - Desktop: äußerer Container scrollt NIE (keine Seiten-Scrollbar)
 * - Nur der Content-Bereich (<main>) scrollt, wenn der Inhalt zu lang ist
 * - Mobile (< lg): Content darf normal scrollen, Sidebar ist ein Hamburger-Overlay
 *
 * Höhenrechnung:
 * - Root-Layout schiebt <main> um calc(4rem + 2px) nach unten (Navbar h-16 + 2px Border)
 * - Hier setzen wir eine feste Höhe = Viewport minus Navbar → kein äußerer Overflow
 *
 * Auth-Guard wird von der Middleware gehandhabt.
 */

import AdminSidebar from '@/components/admin/AdminSidebar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-4rem-2px)] overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
