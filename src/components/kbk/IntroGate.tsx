'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Intro from './Intro';

/**
 * IntroGate — Client-Wrapper um das Intro-Overlay.
 *
 * Das Layout ist Server-Component und kann Intro nicht direkt mit State verwenden.
 * Dieser Wrapper verwaltet `done`-Flag damit Intro nach Abschluss sauber unmountet.
 *
 * `mounted`-Gate (gegen Hydration-Mismatch React #418): Das Intro ist rein
 * dekorativ und client-only — es hängt an Timern, `localStorage` (kbk-intro-seen)
 * und `window.innerWidth` (logoSize). Diese Werte divergieren zwischen Server- und
 * Client-Render, was einen #418 im Intro-Subtree auf JEDER Seite ausloeste. Vor dem
 * Mount rendern wir daher `null` — so landet das Intro nie im SSR-HTML und kann
 * nicht mismatchen. Wiederkehrende Besucher sehen dadurch auch kein Boot-Flash mehr.
 */
export default function IntroGate() {
  const [mounted, setMounted] = useState(false);
  const [done, setDone] = useState(false);
  const pfad = usePathname();
  useEffect(() => {
    setMounted(true);
  }, []);
  // Die Projekte-Seite ist der Link aus dem Lebenslauf: dort ohne Intro.
  if (!mounted || done || pfad?.startsWith('/projekte')) return null;
  return <Intro onDone={() => setDone(true)} />;
}
