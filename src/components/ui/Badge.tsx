import { cn } from '@/lib/utils';

/**
 * Badge-Komponente für Rollen und Genre-Tags.
 */

interface BadgeProps {
  variant?: 'default' | 'green' | 'yellow' | 'red' | 'gray';
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
        variant === 'default' && 'bg-kbk-dark-700 text-secondary',
        variant === 'green' && 'bg-rasta-green/20 text-rasta-green-light',
        variant === 'yellow' && 'bg-rasta-yellow/20 text-rasta-yellow',
        variant === 'red' && 'bg-rasta-red/20 text-rasta-red-light',
        variant === 'gray' && 'bg-kbk-dark-600/50 text-muted',
        className
      )}
    >
      {children}
    </span>
  );
}
