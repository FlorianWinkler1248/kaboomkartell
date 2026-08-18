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
/** Im Leerlauf wird nur jedes n-te Bild gezeichnet (60 / 6 = 10 Bilder je
 *  Sekunde). Die Ruhewelle laeuft mit IDLE_SPEED 0.5 und braucht gut zwoelf
 *  Sekunden fuer einen Durchlauf — zehn Bilder je Sekunde sind dafuer reichlich,
 *  sechzig waren Verschwendung. */
const IDLE_FRAME_SKIP = 6;

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
    // Zaehler und Merker fuer die Leerlauf-Drosselung (siehe `tick`).
    let idleFrame = 0;
    let warIdle = true;

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
      if (!canvas || !container) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const settings = settingsRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      // Layout noch nicht fertig (initial mount + 0-Hoehen-CSS-Phase). Skip
      // diesen Frame, RAF läuft weiter — der nächste Frame zeichnet.
      if (width === 0 || height === 0) return;

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
      for (let i = 0; i < binCount; i++) freqSum += freq[i] ?? 0;
      const hasAudioData = freqSum > 0;
      const useIdle = !settings.isActive || !hasAudioData;

      const cornerRadius = Math.min(barWidth / 2, 4);

      for (let i = 0; i < settings.barCount; i++) {
        const binIndex = Math.floor(i * (binCount / settings.barCount));
        const rawValue = Math.min(1, ((freq[binIndex] ?? 0) / 255) * FFT_GAIN);

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

      // Rueckmeldung fuer die Drosselung in `tick`.
      return useIdle;
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
        // v2.31 (18.08.2026): Im Leerlauf wird nur jedes sechste Bild
        // gezeichnet. Der Takt selbst bleibt unangetastet — der Lebenszyklus
        // der Schleife (siehe Kopf der Datei, v2.23) ist bewusst NICHT
        // angefasst: sie startet weiterhin genau einmal beim Einhaengen und
        // liest ihre Werte aus dem Ref. Ein Anhalten und Wiederanwerfen ueber
        // die Abhaengigkeitsliste war der Fehler der vier gescheiterten
        // Anlaeufe vor v2.23.
        //
        // Warum das wirkt: Nicht das Zeichnen selbst ist teuer (im Leerlauf
        // rund 1,4 ms), sondern dass jede Aenderung der Zeichenflaeche die
        // Hintergrund-Unschaerfe der Player-Leiste darueber zur Neuberechnung
        // zwingt. Seltener zeichnen heisst seltener neu berechnen.
        //
        // `isActive` wird in jedem Bild geprueft, damit die Anzeige beim Start
        // der Wiedergabe sofort wieder voll laeuft.
        const drosseln = warIdle && !settingsRef.current.isActive;
        if (!drosseln || idleFrame % IDLE_FRAME_SKIP === 0) {
          const idle = drawFrame();
          // `undefined` heisst: Bild uebersprungen (Layout noch 0x0) — dann
          // bleibt die letzte Einschaetzung stehen.
          if (idle !== undefined) warIdle = idle;
        }
        idleFrame = (idleFrame + 1) % IDLE_FRAME_SKIP;
      }
      rafId = requestAnimationFrame(tick);
    };

    resize();
    rafId = requestAnimationFrame(tick);

    const handleResize = () => {
      resize();
      if (reducedMotionRef.current) drawStatic();
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
