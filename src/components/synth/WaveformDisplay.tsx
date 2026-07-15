'use client';

/**
 * WaveformDisplay — Echtzeit-Oszilloskop Komponente
 *
 * Zeigt statische Waveform-Vorschau ODER Echtzeit-Animation.
 * Animation läuft NUR wenn getDataFn gesetzt ist (= Audio spielt).
 * Ohne getDataFn wird einmalig eine statische Vorschau gezeichnet.
 */

import { useRef, useEffect } from 'react';
import { WaveformRenderer } from '@/lib/synth/WaveformRenderer';

interface WaveformDisplayProps {
  getDataFn?: () => Uint8Array;
  staticWaveform?: OscillatorType;
  mode?: 'waveform' | 'spectrum';
  color?: string;
  height?: number;
  className?: string;
}

export default function WaveformDisplay({
  getDataFn,
  staticWaveform,
  mode = 'waveform',
  color = '#2D8B46',
  height = 200,
  className = '',
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WaveformRenderer | null>(null);
  const animIdRef = useRef(0);
  const setupDoneRef = useRef(false);

  /**
   * Canvas einmalig einrichten + statische Vorschau zeichnen.
   * KEIN ResizeObserver — verhindert endlose Layout-Loops.
   * Window-Resize wird über ein einfaches Event gehandelt.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    rendererRef.current = new WaveformRenderer(canvas);

    const setupCanvas = () => {
      const w = Math.round(container.clientWidth);
      if (w === 0) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);

      if (staticWaveform) {
        rendererRef.current?.drawStaticWaveform(staticWaveform, color);
      }
      setupDoneRef.current = true;
    };

    setupCanvas();

    /* Window-Resize (selten, kein Loop-Risiko) */
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animIdRef.current);
      rendererRef.current = null;
      setupDoneRef.current = false;
    };
    // Nur beim Mount/Unmount ausführen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Statische Vorschau neu zeichnen wenn sich Waveform oder Farbe ändert.
   * Wird NICHT bei jedem Render aufgerufen — nur bei echten Prop-Änderungen.
   */
  useEffect(() => {
    if (!setupDoneRef.current || !rendererRef.current || getDataFn) return;
    if (staticWaveform) {
      rendererRef.current.drawStaticWaveform(staticWaveform, color);
    }
  }, [staticWaveform, color, getDataFn]);

  /**
   * Echtzeit-Animation — NUR wenn getDataFn gesetzt ist.
   */
  useEffect(() => {
    if (!getDataFn) {
      cancelAnimationFrame(animIdRef.current);
      animIdRef.current = 0;
      /* Zurück zur statischen Vorschau */
      if (rendererRef.current && staticWaveform) {
        rendererRef.current.drawStaticWaveform(staticWaveform, color);
      }
      return;
    }

    const renderer = rendererRef.current;
    if (!renderer) return;

    let running = true;

    const animate = () => {
      if (!running) return;
      const data = getDataFn();
      if (mode === 'waveform') {
        renderer.drawWaveform(data, color);
      } else {
        renderer.drawSpectrum(data, color);
      }
      animIdRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      running = false;
      cancelAnimationFrame(animIdRef.current);
      animIdRef.current = 0;
    };
  }, [getDataFn, mode, color, staticWaveform]);

  return (
    <div
      ref={containerRef}
      className={`kbk-obsidian ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: 'inset 0 2px 12px rgba(0, 0, 0, 0.55)',
      }}
    >
      <canvas
        ref={canvasRef}
        className="block w-full"
        style={{ height, position: 'relative', zIndex: 3 }}
      />
    </div>
  );
}
