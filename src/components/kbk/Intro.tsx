'use client';

/**
 * KBK Intro — Boot-Terminal mit Typewriter-Effekt, dann Logo-Einflug mit Glitch-Titel.
 * Portiert 1:1 aus neues Design KBK/app.jsx (Zeilen 21–92).
 *
 * Ablauf:
 *  1. boot  — 8 Lines werden alle 180ms eingeblendet (Mono, Green).
 *  2. logo  — nach 400ms: LogoMark + Glitch-Titel "KABOOMKARTELL".
 *  3. drop  — nach 2800ms: kk-introflash (weißer Flash über allem).
 *  4. done  — nach 3600ms: onDone() wird gerufen, Komponente rendert null.
 *
 * Respektiert prefers-reduced-motion und merkt sich "schon gesehen" via localStorage.
 */

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import LogoMark from './LogoMark';

interface Props {
  onDone: () => void;
  skip?: boolean;
}

type Stage = 'boot' | 'logo' | 'drop' | 'done';

export default function Intro({ onDone, skip = false }: Props) {
  const t = useTranslations('kbkUi');
  // Boot-Terminal-Zeilen. Erste Zeile bleibt Marken-Token (KABOOMKARTELL_OS),
  // der Rest wird lokalisiert. Ref-stabil, damit der Typewriter-Effekt nicht
  // bei jedem Render neu startet.
  const bootLinesRef = useRef<string[]>([
    '> KABOOMKARTELL_OS v4.04',
    t('introInitSoundsystem'),
    t('introLoadingModules'),
    t('introTuningStream'),
    t('introBpmSync'),
    t('introBassCheck'),
    t('introAuraEngine'),
    t('introSignalLocked'),
  ]);
  const [stage, setStage] = useState<Stage>('boot');
  const [lines, setLines] = useState<string[]>([]);
  // Ref verhindert Doppel-Ausführung bei React StrictMode (Double-Invoke in Dev).
  const doneCalled = useRef(false);
  // Logo-Größe responsive: 420 wirkt auf Smartphones über den Rand und schiebt das
  // Layout aus der Mitte (Bug-Report 30.04.2026). Wir clampen an 70vw für Mobile.
  const [logoSize, setLogoSize] = useState<number>(420);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      const max = Math.min(420, Math.floor(window.innerWidth * 0.7));
      setLogoSize(max);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    // Schon gesehen? — direkt ueberspringen.
    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage.getItem('kbk-intro-seen')) {
          if (!doneCalled.current) {
            doneCalled.current = true;
            onDone();
          }
          return;
        }
      } catch {
        // localStorage kann blockiert sein (SSR, Privacy-Mode) — wir ignorieren das.
      }
    }

    // prefers-reduced-motion respektieren.
    if (typeof window !== 'undefined' && window.matchMedia) {
      const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (rm.matches || skip) {
        if (!doneCalled.current) {
          doneCalled.current = true;
          try {
            window.localStorage.setItem('kbk-intro-seen', '1');
          } catch {
            /* ignore */
          }
          onDone();
        }
        return;
      }
    } else if (skip) {
      if (!doneCalled.current) {
        doneCalled.current = true;
        onDone();
      }
      return;
    }

    // Typewriter-Loop — alle 180ms eine Zeile.
    const bootLines = bootLinesRef.current;
    let i = 0;
    const feed = setInterval(() => {
      setLines((l) => [...l, bootLines[i]]);
      i++;
      if (i >= bootLines.length) {
        clearInterval(feed);
        // Staffel-Timer für Stage-Wechsel (wie im Original).
        setTimeout(() => setStage('logo'), 400);
        setTimeout(() => setStage('drop'), 2800);
        setTimeout(() => {
          setStage('done');
          if (!doneCalled.current) {
            doneCalled.current = true;
            try {
              window.localStorage.setItem('kbk-intro-seen', '1');
            } catch {
              /* ignore */
            }
            onDone();
          }
        }, 3600);
      }
    }, 180);

    return () => clearInterval(feed);
  }, [skip, onDone]);

  if (stage === 'done') return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: stage === 'drop' ? 'kk-introflash 0.6s ease-out forwards' : undefined,
      }}
    >
      {/* Scanlines-Overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, rgba(63,207,74,0.04) 0, rgba(63,207,74,0.04) 1px, transparent 1px, transparent 3px)',
          pointerEvents: 'none',
        }}
      />

      {stage === 'boot' && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            color: '#3FCF4A',
            fontSize: 14,
            lineHeight: 1.8,
            maxWidth: 600,
            padding: 20,
          }}
        >
          {lines.map((l, i) => (
            <div key={i} style={{ opacity: i === lines.length - 1 ? 1 : 0.6 }}>
              {l}
              {i === lines.length - 1 && (
                <span style={{ animation: 'kk-blink 0.5s infinite' }}>_</span>
              )}
            </div>
          ))}
        </div>
      )}

      {(stage === 'logo' || stage === 'drop') && (
        <div
          style={{
            animation: 'kk-logoin 0.8s cubic-bezier(0.2, 0.9, 0.3, 1.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            maxWidth: '92vw',
          }}
        >
          <LogoMark size={logoSize} intensity={1.5} intro={true} />
          <div
            style={{
              textAlign: 'center',
              marginTop: 30,
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(28px, 7vw, 48px)',
              fontWeight: 900,
              letterSpacing: '0.05em',
              color: '#fff',
              textShadow: '0 0 20px #3FCF4A, 0 0 40px #E63B2E',
              animation: 'kk-glitchtxt 0.2s infinite alternate',
            }}
          >
            KABOOM<span style={{ color: '#E63B2E' }}>KARTELL</span>
          </div>
          <div
            style={{
              textAlign: 'center',
              marginTop: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.3em',
            }}
          >
            PHONK // HARDTEK // RAGGATEK
          </div>
        </div>
      )}
    </div>
  );
}
