'use client';

/**
 * TutorialStep — Wrapper für einen einzelnen Tutorial-Schritt.
 *
 * Zeigt Erklaerungstext links und interaktive Synth-Controls rechts. Auf
 * Mobile wird vertikal gestapelt (Text oben, Controls unten). Enthält
 * Schritt-Indikator und Fortschrittsanzeige.
 *
 * v2.23 (02.05.2026 nacht): Obsidian-Migration. Section ist jetzt
 * `kbk-obsidian framed` mit pulsierendem grünen Neon-Border, Header-Bar
 * läuft als dezenter Sub-Layer drinnen.
 *
 * v-learn-motion (13.07.2026): Bewegung rein, damit die Seite zum Anfassen
 * einlädt statt statisch zu stehen. Zwei IntersectionObserver pro Karte:
 *  - Reveal — die Karte gleitet beim Ins-Bild-Scrollen sanft ein (einmalig).
 *  - Fokus — die Karte, die gerade das vertikale Zentrum kreuzt, tritt hervor
 *    (heller, kleiner Lift, glühendes Nummern-Badge, lebhafterer Frame-Puls),
 *    ruhende Karten treten dezent zurück.
 * Reduced-motion / fehlender Observer-Support: alles sofort voll sichtbar,
 * keine erzwungene Animation (der globale `*`-Reset in globals.css greift).
 */

import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { useEffect, useRef, useState } from 'react';

interface TutorialStepProps {
  title: string;
  description: string;
  stepNumber: number;
  totalSteps: number;
  children: React.ReactNode;
}

const RASTA_GREEN = '#3FCF4A';

export default function TutorialStep({
  title,
  description,
  stepNumber,
  totalSteps,
  children,
}: TutorialStepProps) {
  const sectionRef = useRef<HTMLElement>(null);
  /** Karte ist ins Bild gescrollt und eingeblendet (einmalig, dann true). */
  const [revealed, setRevealed] = useState(false);
  /** Karte kreuzt gerade das vertikale Zentrum → im Fokus. */
  const [inFocus, setInFocus] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    /* Reduced-motion oder fehlender Observer-Support: sofort voll sichtbar
       und als „fokussiert" behandeln (keine Abdunklung, keine Bewegung). */
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      setInFocus(true);
      return;
    }

    /* Karten, die beim Laden schon (nahe) im ersten Viewport liegen, sofort
       zeigen — sonst bleibt unter dem großen Hero ein leerer Bereich, bis der
       User scrollt (der Reveal-Threshold griffe dort erst nach dem Scroll). */
    const initiallyVisible = el.getBoundingClientRect().top < window.innerHeight;
    if (initiallyVisible) setRevealed(true);

    /* Reveal-Observer — blendet die Karte einmalig ein, sobald sie in den
       Viewport ragt, danach unbeobachtet lassen. Nur nötig für Karten, die
       beim Laden noch unter dem Fold liegen. */
    const revealObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed(true);
            revealObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    if (!initiallyVisible) revealObs.observe(el);

    /* Fokus-Observer — schmales Zentralband, markiert die aktuell mittige
       Karte. Kein Audio-Bezug, rein visueller Fokus. */
    const focusObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => setInFocus(entry.isIntersecting));
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );
    focusObs.observe(el);

    return () => {
      revealObs.disconnect();
      focusObs.disconnect();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="kbk-obsidian framed"
      id={`step-${stepNumber}`}
      data-focused={inFocus ? 'true' : undefined}
      style={{
        ...obsidianFrameVars(RASTA_GREEN),
        borderRadius: 14,
        overflow: 'hidden',
        /* Reveal: erst durchsichtig + leicht nach unten versetzt, dann rein.
           Fokus: volle Deckkraft + kleiner Lift, ruhende Karten treten zurück. */
        opacity: revealed ? (inFocus ? 1 : 0.78) : 0,
        transform: !revealed
          ? 'translateY(24px)'
          : inFocus
            ? 'translateY(-3px)'
            : 'translateY(0)',
        /* Fokus-Karte pulsiert lebhafter (überschreibt die 2.6s des Frames);
           der globale reduced-motion-Reset schlägt das per !important. */
        animationDuration: inFocus ? '1.5s' : undefined,
        transition: 'opacity 0.45s ease, transform 0.45s ease',
        willChange: 'opacity, transform',
      }}
    >
      {/* Schritt-Indikator-Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 20px',
          background: 'rgba(0,0,0,0.32)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Schrittnummer-Badge — glüht sanft, wenn die Karte im Fokus ist. */}
        <div
          className={inFocus ? 'kbk-aura-glow' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: inFocus ? 'rgba(63,207,74,0.28)' : 'rgba(63,207,74,0.18)',
            border: `1px solid rgba(63,207,74,${inFocus ? 0.7 : 0.45})`,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              color: '#3FCF4A',
              fontFamily: 'var(--font-display)',
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {stepNumber}
          </span>
        </div>

        {/* Fortschrittsbalken */}
        <div
          style={{
            flex: 1,
            height: 4,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(stepNumber / totalSteps) * 100}%`,
              background: 'linear-gradient(90deg, #2D8B46, #3DA85A, #3FCF4A)',
              transition: 'width 0.5s ease',
              boxShadow: '0 0 8px rgba(63,207,74,0.4)',
            }}
          />
        </div>

        <span
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.06em',
          }}
        >
          {stepNumber}/{totalSteps}
        </span>
      </div>

      {/* Inhalt: Text links, Controls rechts */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6 p-6">
        {/* Erklaerungstext */}
        <div className="flex flex-col gap-3">
          <h2
            className="font-heading"
            style={{
              fontWeight: 900,
              fontSize: 22,
              letterSpacing: '0.01em',
              color: '#fff',
              margin: 0,
            }}
          >
            {title}
          </h2>
          <p
            style={{
              color: 'rgba(255,255,255,0.68)',
              lineHeight: 1.55,
              fontSize: 14,
              margin: 0,
            }}
          >
            {description}
          </p>
        </div>

        {/* Interaktive Controls */}
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </section>
  );
}
