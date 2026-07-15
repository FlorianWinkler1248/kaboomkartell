import { cn } from '@/lib/utils';

/**
 * Card-Komponente mit Obsidian-Optik (Vulkanglas + pulsierender Neon-Border).
 *
 * Default: kbk-obsidian + framed (grüner pulsing Border, reflektiert auf
 * Obsidian-Textur). Wer eine ruhigere Card will, setzt `hover={false}` —
 * dann fällt die Pulse-Animation weg, die Vulkanglas-Optik bleibt.
 */

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export default function Card({ className, hover = true, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl p-6 kbk-obsidian',
        hover && 'framed',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
