'use client';

/**
 * DanceSprite — dekorative Pixel-Tänzer für die Startseite (Boomys Crew).
 *
 * Gleiche Mechanik wie BoomyMascot: 4-Frame-Sprite-Sheet (384x96, horizontal)
 * aus `/public/images/dance/<name>.png`, animiert per CSS `steps(4)` zu
 * 140 BPM (≈428ms pro Frame, 1714ms Loop) — beat-synchron zu Boomys Headbang.
 * Dazu ein subtiles Bob (translateY ±5px) mit konfigurierbarem Delay, damit
 * eine Reihe Tänzer nicht wie ein Gleichschritt-Ballett wirkt.
 *
 * Rein dekorativ: aria-hidden, kein Fokus-Target, prefers-reduced-motion
 * stoppt alle Bewegung. Sprite-Generation: scripts/generate-dance-sprites.py.
 */

const BPM = 140;
const LOOP_MS = Math.round((60_000 / BPM) * 4); // 1714ms — 4 Beats
const FRAME_COUNT = 4;

export type DanceSpriteName =
  | 'robo-chrome'
  | 'robo-servo'
  | 'robo-volt'
  | 'robo-bass'
  | 'robo-tread'
  | 'robo-hover'
  | 'ai-girl-nova'
  | 'ai-girl-pixel'
  | 'ai-girl-glitch'
  | 'wisp'
  | 'slime'
  | 'shroom'
  | 'tvhead'
  | 'boombox'
  | 'octo'
  | 'crab'
  | 'moth'
  | 'jelly'
  | 'imp'
  | 'knight'
  | 'monk'
  | 'antling'
  | 'cat'
  | 'pup'
  | 'wormy'
  | 'cactus'
  | 'yeti'
  | 'spider'
  | 'orb'
  | 'shard';

/** Zweit-Animationen (Sheets `<name>--<move>.png`) — siehe Generator MOVES. */
export type DanceMove = 'sit' | 'climb';

const KEYFRAMES = `
@keyframes kbk-dance-step {
  from { transform: translateX(0); }
  to { transform: translateX(-100%); }
}
@keyframes kbk-dance-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
@media (prefers-reduced-motion: reduce) {
  .kbk-dance-bob { animation: none !important; }
  .kbk-dance-strip { animation: none !important; transform: none !important; }
}
`;

interface Props {
  /** Welcher Tänzer aus public/images/dance/. */
  name: DanceSpriteName;
  /** Alternative Bewegung (sit/climb) statt des Standard-Tanzes. */
  move?: DanceMove;
  /** Sichtbare Größe in Pixel (Frame ist 96px nativ). Default 64. */
  size?: number;
  /** Bob-Verzögerung in ms — versetzt die Tänzer einer Reihe gegeneinander. */
  bobDelayMs?: number;
  className?: string;
}

export default function DanceSprite({
  name,
  move,
  size = 64,
  bobDelayMs = 0,
  className,
}: Props) {
  const sheet = move ? `${name}--${move}` : name;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <div
        aria-hidden="true"
        className={['kbk-dance-bob', className].filter(Boolean).join(' ')}
        style={{
          display: 'inline-block',
          // Sitzende Figuren bobben nicht — sie saessen sonst "schwebend".
          animation: move === 'sit' ? 'none' : `kbk-dance-bob 3.4s ease-in-out ${bobDelayMs}ms infinite`,
          willChange: 'transform',
        }}
      >
        <div
          style={{
            width: size,
            height: size,
            overflow: 'hidden',
            position: 'relative',
            imageRendering: 'pixelated',
          }}
        >
          <div
            className="kbk-dance-strip"
            style={{
              // Strip = FRAME_COUNT x Frame-Breite; steps(4) springt durch die
              // Frame-Positionen (Mechanik identisch zu BoomyMascot).
              width: size * FRAME_COUNT,
              height: size,
              backgroundImage: `url(/images/dance/${sheet}.png)`,
              backgroundSize: `${size * FRAME_COUNT}px ${size}px`,
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
              animation: `kbk-dance-step ${LOOP_MS}ms steps(${FRAME_COUNT}) infinite`,
              willChange: 'transform',
            }}
          />
        </div>
      </div>
    </>
  );
}
