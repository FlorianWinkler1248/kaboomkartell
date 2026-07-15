'use client'

/**
 * AudioVisualizer — Canvas-basierter Echtzeit-Equalizer
 *
 * Zeichnet Frequenz-Bars die auf die Musik reagieren.
 * Rasta-Farbverlauf: Grün (Bass) → Gelb (Mitten) → Rot (Höhen).
 * Exponentielles Smoothing für weichen Abfall.
 *
 * Performance: Alles über Refs + requestAnimationFrame, keine React State-Updates im Loop.
 */

import { useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface AudioVisualizerProps {
  /** Funktion die aktuelle Frequenzdaten liefert (aus useAudioAnalyser) */
  getFrequencyData: () => Uint8Array
  /** Ob der Visualizer aktiv animieren soll */
  isActive: boolean
  /** Anzahl der Bars (Standard: 48) */
  barCount?: number
  /** Zusätzliche CSS-Klassen */
  className?: string
}

// Rasta-Farben für den Frequenz-Gradient
const RASTA_GREEN = { r: 45, g: 139, b: 70 }   // #2D8B46
const RASTA_YELLOW = { r: 245, g: 197, b: 24 }  // #F5C518
const RASTA_RED = { r: 212, g: 33, b: 61 }      // #D4213D

/** Interpoliert zwischen zwei Farben */
function lerpColor(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
  t: number
): string {
  const r = Math.round(c1.r + (c2.r - c1.r) * t)
  const g = Math.round(c1.g + (c2.g - c1.g) * t)
  const b = Math.round(c1.b + (c2.b - c1.b) * t)
  return `rgb(${r},${g},${b})`
}

/** Berechnet die Bar-Farbe basierend auf Position im Spektrum */
function getBarColor(index: number, total: number): string {
  const t = index / (total - 1) // 0 bis 1
  if (t < 0.4) {
    // Grün → Gelb (0.0 – 0.4)
    return lerpColor(RASTA_GREEN, RASTA_YELLOW, t / 0.4)
  } else {
    // Gelb → Rot (0.4 – 1.0)
    return lerpColor(RASTA_YELLOW, RASTA_RED, (t - 0.4) / 0.6)
  }
}

// Decay-Faktor: Bars fallen ~8% pro Frame (bei 60fps ≈ 0.5s bis Stille)
const DECAY = 0.92
// Minimale Bar-Höhe im aktiven Zustand (Prozent der Canvas-Höhe)
const MIN_ACTIVE_HEIGHT = 0.02
// Bar-Höhe im inaktiven "schlafenden" Zustand
const IDLE_HEIGHT = 0.015

/** Zeichnet einen Bar mit abgerundeter Oberkante an Position x,y */
function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  barWidth: number,
  height: number,
  radius: number
) {
  ctx.beginPath()
  ctx.moveTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.lineTo(x + barWidth - radius, y)
  ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius)
  ctx.lineTo(x + barWidth, height)
  ctx.lineTo(x, height)
  ctx.closePath()
  ctx.fill()
}

export default function AudioVisualizer({
  getFrequencyData,
  isActive,
  barCount = 48,
  className,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const smoothedRef = useRef<Float32Array>(new Float32Array(barCount))
  const animFrameRef = useRef<number>(0)
  const barColorsRef = useRef<string[]>([])

  // Bar-Farben vorberechnen (pro halber Seite — die wird gespiegelt)
  useEffect(() => {
    const half = Math.floor(barCount / 2)
    // Farbe wächst von Zentrum (grün) nach außen (rot) — im symmetrischen
    // Layout soll die Mitte grün sein, außen gelb/rot.
    barColorsRef.current = Array.from({ length: half }, (_, i) => getBarColor(i, half))
  }, [barCount])

  // Canvas-Größe an Container anpassen (mit DPR-Skalierung)
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(dpr, dpr)
  }, [])

  // Zeichenloop — symmetrisches Layout: Bars werden von der MITTE nach AUSSEN
  // gespiegelt. Dadurch wirkt der Equalizer wie ein klassischer Pro-Audio-
  // Meter. Ein Frequenz-Bin wird zwei Mal gezeichnet (links + rechts vom Zentrum).
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = container.clientWidth
    const height = container.clientHeight
    const smoothed = smoothedRef.current
    const colors = barColorsRef.current

    // Canvas leeren
    ctx.clearRect(0, 0, width, height)

    // Frequenzdaten holen
    const frequencyData = getFrequencyData()
    const binCount = frequencyData.length // 64

    // Anzahl Bars pro Seite (gespiegelt)
    const halfCount = Math.floor(barCount / 2)
    const gap = 2
    const centerX = width / 2
    // Jede Seite hat halfCount Bars + (halfCount-1)*gap Zwischenräume
    const barWidth = Math.max(
      1,
      (width - gap * (2 * halfCount - 1)) / (2 * halfCount)
    )
    const radius = Math.min(barWidth / 2, 3)

    for (let i = 0; i < halfCount; i++) {
      // Frequenz-Bin für diesen Bar (lineares Mapping auf die halbe Breite)
      const binIndex = Math.floor(i * (binCount / halfCount))
      const rawValue = frequencyData[binIndex] / 255

      if (isActive) {
        smoothed[i] = Math.max(rawValue, smoothed[i] * DECAY)
      } else {
        smoothed[i] = smoothed[i] * 0.95
        if (smoothed[i] < IDLE_HEIGHT) smoothed[i] = IDLE_HEIGHT
      }

      const value = isActive
        ? Math.max(smoothed[i], MIN_ACTIVE_HEIGHT)
        : smoothed[i]

      const barHeight = value * height * 0.9
      const y = height - barHeight

      const color = colors[i] || colors[0]
      ctx.fillStyle = color

      if (value > 0.5 && isActive) {
        ctx.shadowColor = color
        ctx.shadowBlur = 6 * value
      } else {
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
      }

      // === Rechte Seite: Zentrum + i * (barWidth + gap)/2 ===
      // Erster Bar startet direkt an der Mitte, wächst nach rechts.
      const xRight = centerX + gap / 2 + i * (barWidth + gap)
      drawBar(ctx, xRight, y, barWidth, height, radius)

      // === Linke Seite (gespiegelt): Zentrum - (i+1) * (barWidth + gap)/2 ===
      const xLeft = centerX - gap / 2 - (i + 1) * barWidth - i * gap
      drawBar(ctx, xLeft, y, barWidth, height, radius)
    }

    // Shadow zurücksetzen
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0

    animFrameRef.current = requestAnimationFrame(draw)
  }, [getFrequencyData, isActive, barCount])

  // Animation starten/stoppen
  useEffect(() => {
    resizeCanvas()
    animFrameRef.current = requestAnimationFrame(draw)

    const handleResize = () => resizeCanvas()
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [draw, resizeCanvas])

  return (
    <div ref={containerRef} className={cn('w-full h-full', className)}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />
    </div>
  )
}
