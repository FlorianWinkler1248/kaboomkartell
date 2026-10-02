'use client';

/**
 * OffscreenAnimationGate — hält Dauer-Animationen an, solange ihr Element
 * außerhalb des Bildes liegt.
 *
 * Grund (Messung 02.10.2026, Handy-Profil): Jede laufende Animation auf
 * `opacity`/`transform` hält eine eigene Grafik-Ebene, auch wenn das Element
 * weit unterhalb des sichtbaren Bereichs liegt. Die Startseite kam so auf
 * 116 Ebenen, davon rund 40 allein durch den Neon-Puls der Karten und 40
 * durch die Tanz-Figuren. Mit der Schranke bleiben nur die Ebenen der
 * Elemente, die gerade zu sehen sind.
 *
 * Mechanik: ein IntersectionObserver setzt `data-offscreen` auf Elemente,
 * die nicht im Bild sind (150px Vorlauf, damit der Puls beim Hereinscrollen
 * schon läuft); die Regeln dazu stehen in globals.css. Ein MutationObserver
 * nimmt nachgeladene Elemente auf (Seitenwechsel, Listen). Ohne JavaScript
 * oder ohne IntersectionObserver bleibt alles wie zuvor: animiert.
 */

import { useEffect } from 'react';

const SELECTOR = '.kbk-obsidian.framed, .kbk-dance-bob, .kbk-boomy-mascot-bob';

export default function OffscreenAnimationGate() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observed = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.toggleAttribute('data-offscreen', !entry.isIntersecting);
        }
      },
      { rootMargin: '150px 0px' },
    );

    const scan = () => {
      for (const el of observed) {
        if (!el.isConnected) {
          io.unobserve(el);
          observed.delete(el);
        }
      }
      document.querySelectorAll(SELECTOR).forEach((el) => {
        if (!observed.has(el)) {
          observed.add(el);
          io.observe(el);
        }
      });
    };
    scan();

    // Höchstens ein Durchgang je Bild, egal wie viele Änderungen ankommen.
    let queued = false;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        scan();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
      for (const el of observed) el.removeAttribute('data-offscreen');
    };
  }, []);

  return null;
}
