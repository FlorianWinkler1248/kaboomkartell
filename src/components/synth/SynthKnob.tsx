'use client';

/**
 * SynthKnob — Drehregler-Komponente für den Synthesizer
 *
 * SVG-basierter Rotary-Knob inspiriert von Serum 2 und analogen Synthesizern.
 * Unterstützt Maus-Drag (vertikal) und Touch-Gesten.
 *
 * Wertbereich: 270 Grad (von 7-Uhr bis 5-Uhr-Position)
 */

import { useCallback, useRef, useState, useEffect } from 'react';

interface SynthKnobProps {
  /** Normalisierter Wert (0 bis 1) */
  value: number;
  /** Callback bei Wertänderung */
  onChange: (value: number) => void;
  /** Beschriftung unter dem Knob */
  label: string;
  /** Minimum für Anzeige-Wert */
  min?: number;
  /** Maximum für Anzeige-Wert */
  max?: number;
  /** Einheit (Hz, dB, %, Ct) */
  unit?: string;
  /** Größenvariante */
  size?: 'sm' | 'md' | 'lg';
  /** Farbe des Wertbogens */
  color?: string;
}

/** Größen-Mapping in Pixel */
const SIZE_MAP = { sm: 48, md: 64, lg: 80 } as const;

/** Winkel-Konstanten (in Grad) */
const START_ANGLE = 135;   // 7-Uhr-Position
const END_ANGLE = 405;     // 5-Uhr-Position (135 + 270)
const TOTAL_ARC = 270;

/**
 * Grad in Radiant umrechnen
 */
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Punkt auf dem Kreisbogen berechnen
 */
function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = degToRad(angleDeg - 90); // -90 weil SVG bei 12 Uhr anfängt
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/**
 * SVG Arc-Path generieren
 */
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export default function SynthKnob({
  value,
  onChange,
  label,
  min = 0,
  max = 100,
  unit = '',
  size = 'md',
  color = '#2D8B46',
}: SynthKnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartValue = useRef(0);

  const px = SIZE_MAP[size];
  const svgSize = px;
  const center = svgSize / 2;
  const radius = center - 6;
  const innerRadius = radius - 4;

  /** Angezeigter Wert (skaliert von min/max) */
  const displayValue = Math.round(min + value * (max - min));

  /** Schriftgröße abhängig von Knob-Größe */
  const fontSize = size === 'sm' ? 9 : size === 'md' ? 11 : 13;
  const labelFontSize = size === 'sm' ? 9 : size === 'md' ? 10 : 12;

  /** Aktueller Winkel basierend auf dem Wert */
  const currentAngle = START_ANGLE + value * TOTAL_ARC;

  /** Indikator-Position (kleiner Strich am Rand) */
  const indicatorOuter = polarToCartesian(center, center, innerRadius - 2, currentAngle);
  const indicatorInner = polarToCartesian(center, center, innerRadius - 8, currentAngle);

  /**
   * Maus-Drag: vertikale Bewegung ändert den Wert.
   * Nach oben = Wert erhöhen, nach unten = verringern.
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartY.current = e.clientY;
      dragStartValue.current = value;
    },
    [value]
  );

  /**
   * Touch-Support: gleiche Logik wie Maus-Drag
   */
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartY.current = e.touches[0].clientY;
      dragStartValue.current = value;
    },
    [value]
  );

  useEffect(() => {
    if (!isDragging) return;

    /** Empfindlichkeit: Pixel pro vollem Wertebereich */
    const sensitivity = 150;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragStartY.current - e.clientY;
      const deltaValue = deltaY / sensitivity;
      const newValue = Math.max(0, Math.min(1, dragStartValue.current + deltaValue));
      onChange(newValue);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const deltaY = dragStartY.current - e.touches[0].clientY;
      const deltaValue = deltaY / sensitivity;
      const newValue = Math.max(0, Math.min(1, dragStartValue.current + deltaValue));
      onChange(newValue);
    };

    const handleUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, onChange]);

  return (
    <div
      ref={knobRef}
      className="flex flex-col items-center gap-1 select-none"
      style={{ width: px + 16 }}
    >
      {/* SVG Knob */}
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="cursor-grab active:cursor-grabbing"
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={displayValue}
      >
        {/* Äußerer Hintergrund-Bogen (voller Bereich) */}
        <path
          d={describeArc(center, center, radius, START_ANGLE, END_ANGLE)}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* Wertbogen (zeigt aktuellen Wert an) */}
        {value > 0.005 && (
          <path
            d={describeArc(center, center, radius, START_ANGLE, currentAngle)}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 4px ${color}80)`,
            }}
          />
        )}

        {/* Innerer Kreis (Knob-Körper) */}
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="url(#knobGradient)"
          stroke="#2a2a3e"
          strokeWidth={1}
        />

        {/* Indikator-Linie (zeigt Knob-Position) */}
        <line
          x1={indicatorInner.x}
          y1={indicatorInner.y}
          x2={indicatorOuter.x}
          y2={indicatorOuter.y}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Wert-Anzeige in der Mitte */}
        <text
          x={center}
          y={center + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#e0e0e0"
          fontSize={fontSize}
          fontFamily="var(--font-mono, monospace)"
        >
          {displayValue}
        </text>

        {/* Gradient-Definition für Knob-Körper */}
        <defs>
          <radialGradient id="knobGradient" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#2a2a3e" />
            <stop offset="100%" stopColor="#141420" />
          </radialGradient>
        </defs>
      </svg>

      {/* Label unter dem Knob */}
      <span
        className="text-secondary text-center leading-tight whitespace-nowrap"
        style={{ fontSize: labelFontSize }}
      >
        {label}
        {unit && (
          <span className="text-muted ml-0.5" style={{ fontSize: labelFontSize - 1 }}>
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}
