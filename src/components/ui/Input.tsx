'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Input-Komponente mit Label und Error-State.
 * Dark-Theme optimiert.
 */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-secondary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-4 py-2.5 rounded-lg',
            'bg-kbk-dark-800 text-foreground placeholder:text-muted',
            'border border-border',
            'focus:border-rasta-green focus:ring-1 focus:ring-rasta-green',
            'transition-colors duration-200',
            'outline-none',
            error && 'border-rasta-red focus:border-rasta-red focus:ring-rasta-red',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-sm text-rasta-red">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
