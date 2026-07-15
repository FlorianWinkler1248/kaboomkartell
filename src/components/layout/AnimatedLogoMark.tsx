'use client';

import Image from 'next/image';

interface Props {
  size?: number;
  className?: string;
  /**
   * Accent-Farbe für Augen-Glow + Ripples. Default: Neon-Green.
   * Andere Werte: Rasta-Red, Rasta-Yellow, Hex.
   */
  accent?: string;
  /** Ripples einblenden (Radio-Wave-Effekt)? Default: true. */
  ripples?: boolean;
  /** Augen-Glow aktiv? Default: true. */
  eyes?: boolean;
  /**
   * Augen-Positionen in Prozent (bezogen auf das Logo).
   * Default basiert auf 4Flow-Wolf-Logo — ggf. pro Logo anpassen.
   */
  eyeTop?: string;
  eyeLeft?: string;
  eyeRight?: string;
}

/**
 * AnimatedLogoMark — 4Flow-Logo mit leuchtenden Augen + Speaker-Ripples
 *
 * Zentrales Brand-Element: das PNG-Logo gelayered mit
 * - 3 konzentrischen Ripple-Kreisen (kk-radio-wave, gestaggert)
 * - Radial-Glow hinter dem Logo
 * - Zwei leuchtenden Augen-Overlays über den Wolf-Augen (kk-eye-glow)
 *
 * Alle Effekte respektieren prefers-reduced-motion (CSS-global).
 */
export default function AnimatedLogoMark({
  size = 160,
  className = '',
  accent = '#3FCF4A',
  ripples = true,
  eyes = true,
  eyeTop = '41%',
  eyeLeft = '34%',
  eyeRight = '58%',
}: Props) {
  const eyeSize = Math.max(8, size * 0.08);
  const eyeBlur = Math.max(2, size * 0.02);

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Ripples (Speaker-Wellen) */}
      {ripples && (
        <>
          <div
            className="absolute inset-0 rounded-full border-2 animate-radio-wave"
            style={{ borderColor: accent, opacity: 0.6 }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 rounded-full border-2 animate-radio-wave"
            style={{ borderColor: accent, opacity: 0.4, animationDelay: '1.2s' }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 rounded-full border-2 animate-radio-wave"
            style={{ borderColor: accent, opacity: 0.25, animationDelay: '2.4s' }}
            aria-hidden="true"
          />
        </>
      )}

      {/* Hintergrund-Glow */}
      <div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{
          background: `radial-gradient(circle, ${accent}40 0%, transparent 65%)`,
        }}
        aria-hidden="true"
      />

      {/* Das Logo */}
      <Image
        src="/images/logo-4flow.png"
        alt="4Flow Logo"
        width={size}
        height={size}
        className="relative rounded-full z-10"
        priority
      />

      {/* Leuchtende Augen */}
      {eyes && (
        <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
          <div
            className="absolute animate-eye-glow"
            style={{
              left: eyeLeft,
              top: eyeTop,
              width: eyeSize,
              height: eyeSize,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${accent} 0%, ${accent}80 35%, transparent 70%)`,
              filter: `blur(${eyeBlur}px)`,
            }}
          />
          <div
            className="absolute animate-eye-glow"
            style={{
              left: eyeRight,
              top: eyeTop,
              width: eyeSize,
              height: eyeSize,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${accent} 0%, ${accent}80 35%, transparent 70%)`,
              filter: `blur(${eyeBlur}px)`,
              animationDelay: '0.08s',
            }}
          />
        </div>
      )}
    </div>
  );
}
