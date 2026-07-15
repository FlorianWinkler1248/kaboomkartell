'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * IntroBoot — Terminal-Style Boot-Sequenz einmalig pro Browser-Session
 *
 * Zeigt beim allerersten Pageload eine Mini-Sequenz mit Typewriter-Lines.
 * Wird per localStorage-Flag "kbk-intro-seen" nur einmal pro Browser ausgelöst,
 * damit wiederkehrende User nicht jedes Mal warten müssen.
 *
 * Skippable per Click oder [Skip]-Button. Respektiert prefers-reduced-motion
 * (ueberspringt automatisch).
 *
 * Gesamtdauer ca. 2.8s.
 */

// Anzahl der Boot-Lines — die Texte selbst kommen aus dem i18n-Katalog
// (bootLine1..bootLine5), die Timing-Konstanten brauchen nur die Anzahl.
const BOOT_LINE_COUNT = 5;

const LINE_DELAY_MS = 350;
const INITIAL_DELAY_MS = 150;
const FADE_START_MS = INITIAL_DELAY_MS + BOOT_LINE_COUNT * LINE_DELAY_MS + 300;
const TOTAL_DURATION_MS = FADE_START_MS + 700;

const STORAGE_KEY = 'kbk-intro-seen';

export default function IntroBoot() {
  const t = useTranslations('playerUi');
  const BOOT_LINES = [
    t('bootLine1'),
    t('bootLine2'),
    t('bootLine3'),
    t('bootLine4'),
    t('bootLine5'),
  ];
  const [visible, setVisible] = useState(false);
  const [linesShown, setLinesShown] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);

  // Nur beim allerersten Mount entscheiden ob gezeigt wird
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Reduced-Motion -> Intro ueberspringen
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      localStorage.setItem(STORAGE_KEY, '1');
      return;
    }
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen) return;
    setVisible(true);
  }, []);

  // Sequenz steuern
  useEffect(() => {
    if (!visible) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < BOOT_LINE_COUNT; i++) {
      timers.push(setTimeout(() => setLinesShown(i + 1), INITIAL_DELAY_MS + i * LINE_DELAY_MS));
    }
    timers.push(setTimeout(() => setFadingOut(true), FADE_START_MS));
    timers.push(
      setTimeout(() => {
        setVisible(false);
        localStorage.setItem(STORAGE_KEY, '1');
      }, TOTAL_DURATION_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  const handleSkip = () => {
    setVisible(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, '1');
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t('bootSequenceAria')}
      className={`fixed inset-0 z-[9999] bg-kbk-black flex items-center justify-center cursor-pointer ${
        fadingOut ? 'animate-introflash' : ''
      }`}
      onClick={handleSkip}
    >
      <div className="font-mono text-sm sm:text-base text-rasta-green space-y-2 max-w-md px-6 w-full">
        {BOOT_LINES.slice(0, linesShown).map((line, i) => (
          <p key={i} className="whitespace-pre text-glow-green">
            {line}
          </p>
        ))}
        {linesShown < BOOT_LINE_COUNT && (
          <span
            className="inline-block w-2 h-4 bg-rasta-green animate-blink align-middle"
            aria-hidden="true"
          />
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleSkip();
        }}
        className="absolute bottom-6 right-6 font-mono text-[10px] text-muted tracking-[0.25em] uppercase hover:text-rasta-green transition-colors cursor-pointer"
      >
        {t('skip')}
      </button>
    </div>
  );
}
