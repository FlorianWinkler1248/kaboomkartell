'use client';

/**
 * BoomyMascot — Pixel-Wolf-Sprite-Animation in Boomy-Lila.
 *
 * 4 Frames als horizontaler Sprite-Sheet (`/public/images/boomy-sprites.png`,
 * 384x96), animiert per CSS `steps(4)` zu **140 BPM** (≈428ms pro Frame,
 * 1714ms voller Loop = 4 Beats). Das ist Headbang-Sync passend zum Phonk-/
 * Hardphonk-Set-Vibe.
 *
 * Aussere Container-Animation ist ein subtiles Bob (translateY ±6px, 3.4s)
 * plus pulsierender Lila-Glow synchron zum Bob. „Coole Bewegung auf dem
 * Screen" wie Flow es wollte.
 *
 * Sprite-Generation: scripts/generate-boomy-sprites.py (PIL/Pillow).
 *
 * v2.25 (03.05.2026 nacht).
 */

const BPM = 140;
const LOOP_MS = Math.round((60_000 / BPM) * 4); // 1714ms — 4 beats
const FRAME_COUNT = 4;

const KEYFRAMES = `
@keyframes kbk-boomy-step {
  from { transform: translateX(0); }
  to { transform: translateX(-100%); }
}
@keyframes kbk-boomy-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes kbk-boomy-glow {
  0%, 100% {
    box-shadow:
      0 0 0 1px rgba(139, 92, 246, 0.55),
      0 0 18px rgba(139, 92, 246, 0.35),
      0 6px 22px rgba(76, 50, 130, 0.45);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(180, 140, 255, 0.85),
      0 0 32px rgba(180, 140, 255, 0.6),
      0 8px 32px rgba(76, 50, 130, 0.6);
  }
}
@media (prefers-reduced-motion: reduce) {
  .kbk-boomy-mascot-bob { animation: none !important; }
  .kbk-boomy-mascot-strip { animation: none !important; transform: none !important; }
  .kbk-boomy-mascot-frame { animation: none !important; }
}
`;

interface Props {
  /** Sprite-Größe in Pixel (Standard 96, gleich der Frame-Aufloesung im Sheet). */
  size?: number;
  /** Inline-Margin oder Position-Override. */
  className?: string;
  /** Optionaler Aria-Label-Override. Default: "Boomy". */
  label?: string;
}

export default function BoomyMascot({
  size = 96,
  className,
  label = 'Boomy',
}: Props) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <div
        className={['kbk-boomy-mascot-bob', className].filter(Boolean).join(' ')}
        role="img"
        aria-label={label}
        style={{
          display: 'inline-block',
          animation: 'kbk-boomy-bob 3.4s ease-in-out infinite',
          willChange: 'transform',
        }}
      >
        <div
          className="kbk-boomy-mascot-frame"
          style={{
            width: size,
            height: size,
            borderRadius: 8,
            overflow: 'hidden',
            position: 'relative',
            animation: 'kbk-boomy-glow 1.714s ease-in-out infinite',
            // Pixel-Aliasing: Hard-Edge-Rendering, damit der PixelArt-Stil
            // nicht durch Browser-Smoothing weichgespuelt wird.
            imageRendering: 'pixelated',
          }}
        >
          <div
            className="kbk-boomy-mascot-strip"
            style={{
              // Strip ist FRAME_COUNT× so breit wie der sichtbare Frame.
              // overflow:hidden auf Parent kappt alles ausser Frame 1 zu Beginn.
              // translateX(-100%) shiftet den Strip um seine eigene Breite
              // (= 4 Frames) — mit steps(4) springt er sauber zwischen den
              // 4 Frame-Positionen 0%/25%/50%/75% durch.
              width: size * FRAME_COUNT,
              height: size,
              backgroundImage: 'url(/images/boomy-sprites.png)',
              backgroundSize: `${size * FRAME_COUNT}px ${size}px`,
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
              animation: `kbk-boomy-step ${LOOP_MS}ms steps(${FRAME_COUNT}) infinite`,
              willChange: 'transform',
            }}
          />
        </div>
      </div>
    </>
  );
}
