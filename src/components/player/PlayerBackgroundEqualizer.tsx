'use client';

/**
 * PlayerBackgroundEqualizer — Vollbild-Hintergrund-Equalizer für den
 * fixierten Player-Bereich (MiniPlayer / RadioBar).
 *
 * Symmetrie: Bars werden 4-fach gespiegelt — links/rechts vom Zentrum
 * UND oben/unten. Dadurch fuellt der Equalizer den kompletten Hintergrund
 * aesthetisch aus.
 *
 * Layout: `absolute inset-0 z-0 pointer-events-none`. Buttons + Labels des
 * Players liegen mit `relative z-10` darüber.
 *
 * v2.23 (02.05.2026 nacht): RAF-Lifecycle komplett neu.
 *
 *  Vorher (v2.18–v2.22, 4 fehlgeschlagene Iterationen): drawRef +
 *  drawStaticRef + reducedMotionRef wurden über separate useEffects
 *  synchronisiert, RAF lief in [] useEffect mit isConnected-Self-Check
 *  ohne cancelAnimationFrame im cleanup. Wenn der MiniPlayer-Subtree durch
 *  einen Provider-State-Flip (SessionProvider authenticated->loading)
 *  unmountet+remountet, brach die Loop weil der OLD tick beim
 *  isConnected=false return't und der NEW tick einen frischen RAF startete
 *  — der wieder durch das nächste Re-Mount unterbrochen wurde, BEVOR der
 *  zweite frame fired.
 *
 *  Jetzt: Settings-Ref-Pattern. Props werden bei jedem Render in einen Ref
 *  geschrieben (synchron im Function-Body, vor dem return). RAF startet
 *  einmal beim Mount, liest aus settingsRef.current, und wird im cleanup
 *  sauber via cancelAnimationFrame gecancelt. Ueberlebt jeden Re-Render +
 *  Re-Mount.
 *
 *  Layout-Robustheit: wenn container.clientWidth oder ~Height === 0
 *  (z.B. während initialer Layout-Phase), wird der frame uebersprungen,
 *  RAF läuft aber weiter — der nächste frame zeichnet, sobald Layout
 *  fertig ist.
 *
 * Performance: requestAnimationFrame, alles über Refs (kein React-State
 * im Loop). Frame-Skip wenn document.hidden oder Layout 0×0. Reduced-Motion:
 * statisches Bild gemalt, dann RAF-Loop beendet.
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Liefert aktuelle Frequenzdaten (aus useAudioAnalyser, 64 Bins, 0-255). */
  getFrequencyData: () => Uint8Array;
  /** Aktiv = Audio spielt. Inaktiv = ruhige Idle-Wellen. */
  isActive: boolean;
  /** Akzentfarbe als CSS-Hex (z.B. Channel-Farbe). */
  accentColor: string;
  /** v2.18: Sekundärfarbe bei Subgenre-Override. Aktuell ungenutzt — hier nur
   *  als API-Stabilitaet behalten, falls später Layer-2 zurueckkommt. */
  secondaryAccentColor?: string | null;
  /** Anzahl Bars pro Halb-Quadrant (Standard 56). */
  barCount?: number;
  /** Optionale CSS-Klassen. */
  className?: string;
}

const DECAY = 0.88;
const IDLE_BASE = 0.10;
const IDLE_AMP = 0.06;
const IDLE_SPEED = 0.5;
const IDLE_PHASE_PER_BAR = 0.25;
const MIN_ACTIVE_HEIGHT = 0.04;
const FFT_GAIN = 1.4;
const NEON_GLOW_BLUR_ACTIVE = 10;
const NEON_GLOW_BLUR_IDLE = 4;
/** Abfall der gleitenden Spitze je Bild (~0.8 % ). Langsam genug, dass die
 *  Aussteuerung waehrend eines Stuecks ruhig steht, schnell genug, um einem
 *  leiseren Abschnitt binnen ein bis zwei Sekunden zu folgen. */
const SPITZE_ABFALL = 0.992;
/** Untergrenze fuer den Bezugswert. Ohne sie wuerde bei fast stillem Signal
 *  das Rauschen auf volle Balkenhoehe hochgezogen. */
const SPITZE_MIN = 40;

/** Ab dieser mittleren Frequenz-Staerke (0-255 je Bin) gilt Audio als
 *  wirklich laufend. `> 0` genuegt nicht: bei offenem Audio-Kontext liefert
 *  die Analyse auch ohne Wiedergabe einzelne Werte ueber null, und die
 *  Ruhe-Erkennung schlug dadurch nie an. */
const AUDIO_SCHWELLE = 2;

/** Konvertiert #RRGGBB zu {r,g,b}. Fallback rasta-green bei ungueltiger Eingabe. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 63, g: 207, b: 74 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export default function PlayerBackgroundEqualizer({
  getFrequencyData,
  isActive,
  accentColor,
  secondaryAccentColor = null,
  barCount = 56,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Settings-Ref: wird bei JEDEM Render synchron aktualisiert (im Function-Body,
  // nicht im useEffect). Refs dürfen während des Render-Cycles geschrieben
  // werden, weil sie nicht in der State-Machine hängen. Die RAF-Loop liest aus
  // diesem Ref und sieht so immer die aktuellen Props — ohne dass die Loop
  // selber neu mounten muss.
  const settingsRef = useRef({ getFrequencyData, isActive, accentColor, barCount });
  settingsRef.current = { getFrequencyData, isActive, accentColor, barCount };
  // secondaryAccentColor wird bewusst nicht in settingsRef abgelegt — aktuell
  // ungenutzt im Render-Pfad.
  void secondaryAccentColor;

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  // RAF-Lifecycle — startet einmal beim Mount, stoppt sauber beim Unmount.
  // Eigene Float32Array für smoothing innerhalb der Effect-Closure: wenn
  // barCount sich ändert (was selten passiert), startet die Loop nicht neu —
  // dafür wird im Loop-Body die Buffer-Größe mit der aktuellen barCount
  // verglichen und ggf. neu alloziiert.
  useEffect(() => {
    let rafId = 0;
    let stopped = false;
    let smoothed = new Float32Array(settingsRef.current.barCount);
    // Gleitende Spitze fuer die Aussteuerung (siehe `bezug` in `drawFrame`).
    let spitze = SPITZE_MIN;
    // Ruht die Anzeige gerade? Dann steht ein einmal gezeichnetes Standbild
    // auf der Flaeche und sie wird nicht mehr angefasst (siehe `tick`).
    let ruht = false;

    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawStatic = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { accentColor: ac, barCount: bc } = settingsRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      const halfH = height / 2;
      const halfW = width / 2;
      const gap = 2;
      const barWidth = Math.max(1, (halfW - gap * bc) / bc);
      const rgb = hexToRgb(ac);
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < bc; i++) {
        const t = i / bc;
        const value = 0.55 + 0.30 * Math.sin(t * Math.PI * 2.4);
        const barH = value * halfH * 0.95;
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`;
        const xRight = halfW + i * (barWidth + gap);
        const xLeft = halfW - (i + 1) * barWidth - i * gap;
        ctx.fillRect(xRight, halfH - barH, barWidth, barH);
        ctx.fillRect(xLeft, halfH - barH, barWidth, barH);
        ctx.fillRect(xRight, halfH, barWidth, barH);
        ctx.fillRect(xLeft, halfH, barWidth, barH);
      }
    };

    const drawFrame = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      const settings = settingsRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      // Layout noch nicht fertig (initial mount + 0-Hoehen-CSS-Phase). Skip
      // diesen Frame, RAF läuft weiter — der nächste Frame zeichnet.
      if (width === 0 || height === 0) return false;

      // Bar-Buffer bei Größe-Änderung neu alloziieren (zero-copy zum Reset).
      if (smoothed.length !== settings.barCount) {
        smoothed = new Float32Array(settings.barCount);
      }

      const halfH = height / 2;
      const halfW = width / 2;
      ctx.clearRect(0, 0, width, height);

      const freq = settings.getFrequencyData();
      const binCount = freq.length || 64;
      const gap = 1;
      const barWidth = Math.max(1, (halfW - gap * settings.barCount) / settings.barCount);
      const tNow = performance.now() / 1000;
      const baseRgb = hexToRgb(settings.accentColor);

      // FFT liefert nur echte Daten wenn AudioContext live ist. Direct-Play
      // ohne Analyser → komplett 0 → wir zeigen die Idle-Welle.
      let freqSum = 0;
      let freqMax = 0;
      for (let i = 0; i < binCount; i++) {
        const v = freq[i] ?? 0;
        freqSum += v;
        if (v > freqMax) freqMax = v;
      }
      const hasAudioData = freqSum > 0;
      const useIdle = !settings.isActive || !hasAudioData;

      // v2.31 (18.08.2026): Aussteuerung. Die Balken werden gegen die lauteste
      // gerade vorhandene Frequenz gemessen, nicht gegen den theoretischen
      // Vollausschlag 255.
      //
      // Grund: `createMediaElementSource` greift das Signal NACH der
      // Lautstaerke des Audio-Elements ab (`useAudioPlayer.ts:141` setzt sie).
      // Gegen die feste 255 gemessen schrumpfte die Welle deshalb mit dem
      // Lautstaerkeregler — sie zeigte die Reglerstellung statt der Musik.
      // Die gleitende Spitze faellt langsam ab, damit die Aussteuerung
      // waehrend eines Stuecks ruhig steht und nicht bei jedem Schlag springt.
      if (!useIdle) {
        spitze = Math.max(freqMax, spitze * SPITZE_ABFALL);
      }
      const bezug = Math.max(SPITZE_MIN, spitze);

      const cornerRadius = Math.min(barWidth / 2, 4);

      for (let i = 0; i < settings.barCount; i++) {
        const binIndex = Math.floor(i * (binCount / settings.barCount));
        const rawValue = Math.min(1, ((freq[binIndex] ?? 0) / bezug) * FFT_GAIN);

        if (!useIdle) {
          smoothed[i] = Math.max(rawValue, smoothed[i] * DECAY);
        } else {
          const phase = tNow * IDLE_SPEED + i * IDLE_PHASE_PER_BAR;
          smoothed[i] = IDLE_BASE + IDLE_AMP * Math.sin(phase);
        }

        const value = !useIdle
          ? Math.max(smoothed[i], MIN_ACTIVE_HEIGHT)
          : smoothed[i];
        const barH = value * halfH * 0.95;
        const alpha = !useIdle ? 0.35 + value * 0.35 : 0.18 + value * 0.30;

        ctx.fillStyle = `rgba(${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b}, ${alpha})`;
        ctx.shadowColor = `rgba(${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b}, 0.85)`;
        ctx.shadowBlur = !useIdle ? NEON_GLOW_BLUR_ACTIVE : NEON_GLOW_BLUR_IDLE;

        const xRight = halfW + i * (barWidth + gap);
        const xLeft = halfW - (i + 1) * barWidth - i * gap;
        const yTop = halfH - barH;

        if (barH >= 1) {
          ctx.beginPath();
          ctx.roundRect(xRight, yTop, barWidth, barH, cornerRadius);
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(xLeft, yTop, barWidth, barH, cornerRadius);
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(xRight, halfH, barWidth, barH, cornerRadius);
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(xLeft, halfH, barWidth, barH, cornerRadius);
          ctx.fill();
        }
      }

      return true;
    };

    const tick = () => {
      if (stopped) return;

      if (reducedMotionRef.current) {
        // Einmal malen, dann ruhen — kein neuer RAF.
        drawStatic();
        return;
      }

      // Tab im Hintergrund: skip Frame, aber Loop weiterlaufen lassen, damit
      // bei Tab-Wechsel sofort wieder gezeichnet wird.
      if (typeof document !== 'undefined' && !document.hidden) {
        // v2.31 (18.08.2026): Spielt nichts, ruht die Anzeige. Ein Standbild
        // wird einmal gezeichnet, danach wird die Flaeche nicht mehr angefasst.
        //
        // Warum das der wirksame Hebel ist — am 18.08.2026 in Chrome gemessen:
        // Nicht das Zeichnen kostet (ein Bild rund 1,4 ms), sondern dass das
        // Ergebnis in jedem Einzelbild ins Bild uebernommen wird. Auf
        // `visibility: hidden` gestellt laeuft die Schleife unveraendert
        // weiter, und die Seite springt von 83 ms auf 16,7 ms je Bild —
        // also von 11 auf volle 60 Bilder je Sekunde.
        //
        // Der Takt selbst bleibt unangetastet: Die Schleife startet weiterhin
        // genau einmal beim Einhaengen und liest ihre Werte aus dem Ref
        // (siehe Dateikopf, v2.23). Sie anzuhalten und ueber die
        // Abhaengigkeitsliste wieder anzuwerfen war der Fehler der vier
        // Anlaeufe davor — deshalb laeuft sie durch und prueft nur billig,
        // ob wieder etwas zu tun ist.
        const settings = settingsRef.current;
        let staerke = 0;
        if (settings.isActive) {
          const freq = settings.getFrequencyData();
          const n = freq.length || 1;
          let summe = 0;
          for (let i = 0; i < n; i++) summe += freq[i] ?? 0;
          staerke = summe / n;
        }
        const spielt = settings.isActive && staerke >= AUDIO_SCHWELLE;

        if (spielt) {
          ruht = false;
          drawFrame();
        } else if (!ruht) {
          // Uebergang in die Ruhe: die Ruhewelle EINMAL zeichnen, danach die
          // Flaeche nicht mehr anfassen.
          //
          // Hier stand zuerst `drawStatic()` — falsch: das ist das Standbild
          // fuer `prefers-reduced-motion` und zeichnet die Balken auf 55 bis
          // 85 Prozent Hoehe. Vierfach gespiegelt fuellte das die Leiste mit
          // einem grellen Block, statt die zehn Prozent hohe Ruhewelle zu
          // zeigen. `drawFrame` trifft im Leerlauf genau diese Welle.
          ruht = drawFrame() === true;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    resize();
    rafId = requestAnimationFrame(tick);

    const handleResize = () => {
      resize();
      if (reducedMotionRef.current) drawStatic();
      // Groessenaenderung leert die Flaeche. Ruht die Anzeige gerade, wuerde
      // sie leer stehen bleiben — deshalb Ruhe aufheben, das naechste Bild
      // setzt das Standbild neu.
      ruht = false;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Wenn reduced-motion getoggelt wird: einmal frisch malen.
  useEffect(() => {
    if (!reducedMotion) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { accentColor: ac, barCount: bc } = settingsRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    const halfH = height / 2;
    const halfW = width / 2;
    const gap = 2;
    const barWidth = Math.max(1, (halfW - gap * bc) / bc);
    const rgb = hexToRgb(ac);
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < bc; i++) {
      const t = i / bc;
      const value = 0.55 + 0.30 * Math.sin(t * Math.PI * 2.4);
      const barH = value * halfH * 0.95;
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`;
      const xRight = halfW + i * (barWidth + gap);
      const xLeft = halfW - (i + 1) * barWidth - i * gap;
      ctx.fillRect(xRight, halfH - barH, barWidth, barH);
      ctx.fillRect(xLeft, halfH - barH, barWidth, barH);
      ctx.fillRect(xRight, halfH, barWidth, barH);
      ctx.fillRect(xLeft, halfH, barWidth, barH);
    }
  }, [reducedMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn('absolute inset-0 z-0 overflow-hidden pointer-events-none', className)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
