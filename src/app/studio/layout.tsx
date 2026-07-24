/**
 * Studio-Layout (ADR-041 Welle 3)
 *
 * Scroll-Containment-Shell für das Artist-Studio — Klon des Admin-Layouts:
 * - Desktop: äußerer Container scrollt NIE (keine Seiten-Scrollbar)
 * - Nur der Content-Bereich (<main>) scrollt, wenn der Inhalt zu lang ist
 * - Mobile (< lg): Content darf normal scrollen, Sidebar ist ein Hamburger-Overlay
 *
 * Höhenrechnung:
 * - Root-Layout schiebt <main> um calc(4rem + 2px) nach unten (Navbar h-16 + 2px Border)
 * - Hier setzen wir eine feste Höhe = Viewport minus Navbar → kein äußerer Overflow
 *
 * Auth-Gate: Server-seitig via auth() — Zugriff nur für KUENSTLER + ADMIN.
 * Alle anderen landen auf /mission (dort lebt der Artist-Funnel-Pitch).
 * Kein DB-Zugriff nötig — die Rolle steckt in der Session.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import StudioSidebar from '@/components/studio/StudioSidebar';

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== 'KUENSTLER' && role !== 'ADMIN') {
    redirect('/mission');
  }

  return (
    <div className="flex h-[calc(100vh-4rem-2px)] overflow-hidden">
      <StudioSidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
