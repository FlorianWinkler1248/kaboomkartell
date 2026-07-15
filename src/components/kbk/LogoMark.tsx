'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

/**
 * KBK LogoMark — animiertes Wolf-Logo aus dem neuen Design.
 * Portiert aus neues Design KBK/logo-mark.jsx (TSX, 4Flow-Logo).
 *
 * Layers (außen → innen):
 * - 3 konzentrische Ripples (Speaker-Cones)
 * - Optional Shard-Intro (12 Dreiecke scatter→assemble→boom)
 * - Glow-Shadow (green + red doppel-drop)
 * - Das PNG-Logo mit Breath-Scale (CSS-Animation, GPU-Compositor)
 * - Zwei Eye-Glow Dots an korrekter Position (aus dem Artifact: 38.43%/57.87% links, 35%/35.09% top)
 * - Scanline-Overlay (nur auf dem Logo-Disc)
 *
 * v2.9 Performance-Fix (Audit P2): Beat-Clock von setInterval+setState
 * (React-Rerender alle 428ms) auf reine CSS-Animation umgestellt.
 * Effekt: 0 Re-Renders pro Beat, GPU-only Pulse statt CPU-Reconciliation.
 * Eye-Glow ist jetzt synchron zum Breath (kein 2-Phase-Toggle mehr) —
 * minimal Visualbschnitt, deutlich glatter auf Mobile.
 */

interface Props {
  size?: number;
  intensity?: number;
  intro?: boolean;
  className?: string;
}

const BEAT_KEYFRAMES = `
@keyframes kbk-logo-breath {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}
@keyframes kbk-eye-pulse-left {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.3); }
}
@keyframes kbk-eye-pulse-right {
  0%, 100% { transform: scale(1.3); }
  50% { transform: scale(1); }
}
`;

export default function LogoMark({
  size = 320,
  intensity = 1,
  intro = false,
  className = '',
}: Props) {
  const [phase, setPhase] = useState<'idle' | 'scatter' | 'assemble' | 'boom'>(
    intro ? 'scatter' : 'idle'
  );

  // Intro-Sequenz
  useEffect(() => {
    if (!intro) return;
    const t1 = setTimeout(() => setPhase('assemble'), 200);
    const t2 = setTimeout(() => setPhase('boom'), 1400);
    const t3 = setTimeout(() => setPhase('idle'), 1900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [intro]);

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      <style dangerouslySetInnerHTML={{ __html: BEAT_KEYFRAMES }} />
      {/* Speaker-Ripples */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            border: `2px solid rgba(63,207,74,${0.3 * intensity})`,
            animation: `kk-ripple 1.7s ease-out ${i * 0.55}s infinite`,
          }}
        />
      ))}

      {/* Shard-Intro */}
      {intro && phase !== 'idle' && (
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const dist = phase === 'scatter' ? 200 : 0;
            const tx = Math.cos(angle) * dist;
            const ty = Math.sin(angle) * dist;
            const rot = phase === 'scatter' ? i * 30 : 0;
            const colors = ['#3FCF4A', '#E63B2E', '#F5D02E'];
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 0,
                  height: 0,
                  borderLeft: '8px solid transparent',
                  borderRight: '8px solid transparent',
                  borderBottom: `18px solid ${colors[i % 3]}`,
                  transform: `translate(${tx - 8}px, ${ty - 9}px) rotate(${rot}deg)`,
                  transition:
                    'transform 1.1s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.4s',
                  opacity: phase === 'boom' ? 0 : 1,
                  filter: 'drop-shadow(0 0 6px currentColor)',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Wolf-Disc mit Breath-Pulse + Glow */}
      <div
        className="absolute inset-0"
        style={{
          transform: phase === 'boom' ? 'scale(1.15)' : undefined,
          transition: phase === 'boom' ? 'transform 0.18s ease-out' : undefined,
          // v2.9 Performance: CSS-Animation statt JS-State-Tick.
          // Disabled während Boom (transform-Override).
          animation: phase === 'idle' ? 'kbk-logo-breath 856ms ease-in-out infinite' : undefined,
          opacity: phase === 'scatter' ? 0 : 1,
          filter: `drop-shadow(0 0 ${18 * intensity}px rgba(63,207,74,${
            0.45 * intensity
          })) drop-shadow(0 0 ${28 * intensity}px rgba(230,59,46,${0.3 * intensity}))`,
        }}
      >
        <Image
          src="/images/logo-4flow.png"
          alt="KaboomKartell"
          width={size}
          height={size}
          className="w-full h-full block select-none"
          draggable={false}
          priority
        />

        {/* Eye-Glow Left — Vorlage-Position: top 35%, left 38.43%, width 4.91%,
             height 4.17%. v2.9: CSS-Animation statt JS-State-Toggle. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '35%',
            left: '38.43%',
            width: '4.91%',
            height: '4.17%',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, #ffffff 0%, #d4ffcd 30%, #3FCF4A 65%, transparent 100%)',
            filter: `drop-shadow(0 0 ${8 * intensity}px #3FCF4A) drop-shadow(0 0 ${
              16 * intensity
            }px #3FCF4A) drop-shadow(0 0 ${32 * intensity}px #3FCF4A)`,
            animation: 'kbk-eye-pulse-left 856ms ease-in-out infinite',
            pointerEvents: 'none',
            mixBlendMode: 'screen',
          }}
        />
        {/* Eye-Glow Right — Vorlage-Position: top 35.09%, left 57.87%,
             width 4.81%, height 3.98%. Anti-Phase zum linken Auge. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '35.09%',
            left: '57.87%',
            width: '4.81%',
            height: '3.98%',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, #ffffff 0%, #ffd4cd 30%, #E63B2E 65%, transparent 100%)',
            filter: `drop-shadow(0 0 ${8 * intensity}px #E63B2E) drop-shadow(0 0 ${
              16 * intensity
            }px #E63B2E) drop-shadow(0 0 ${32 * intensity}px #E63B2E)`,
            animation: 'kbk-eye-pulse-right 856ms ease-in-out infinite',
            pointerEvents: 'none',
            mixBlendMode: 'screen',
          }}
        />

        {/* Scanline auf dem Disc */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background:
              'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
            pointerEvents: 'none',
            mixBlendMode: 'multiply',
            opacity: 0.5 * intensity,
          }}
        />
      </div>

      {/* Boom-Flash */}
      {phase === 'boom' && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '-40%',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(245,208,46,0.8) 0%, rgba(230,59,46,0.4) 30%, transparent 70%)',
            animation: 'kk-flash 0.5s ease-out forwards',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
