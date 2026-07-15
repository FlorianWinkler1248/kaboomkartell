'use client';

/**
 * Toast-Notification-System
 *
 * Globaler Provider für Toast-Benachrichtigungen.
 * Unterstützt success, error, info Varianten mit Auto-Dismiss.
 *
 * Nutzung:
 *   const { toast } = useToast();
 *   toast({ type: 'success', message: 'Track hinzugefügt!' });
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastInput {
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// Icon-Map
const iconMap: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

// Farb-Map
const colorMap: Record<ToastType, string> = {
  success: 'border-rasta-green/30 bg-rasta-green/10 text-rasta-green',
  error: 'border-rasta-red/30 bg-rasta-red/10 text-rasta-red',
  info: 'border-blue-400/30 bg-blue-400/10 text-blue-400',
};

export default function ToastProvider({ children }: { children: ReactNode }) {
  const tc = useTranslations('commonUi');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(({ type, message, duration = 3500 }: ToastInput) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, message }]);

    // Auto-Dismiss
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast-Container (fixiert unten rechts) */}
      <div className="fixed bottom-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const Icon = iconMap[t.type];
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm',
                'animate-slide-in-right min-w-[280px] max-w-sm',
                colorMap[t.type],
              )}
              role="alert"
            >
              <Icon size={18} className="shrink-0" />
              <p className="text-sm font-medium flex-1 text-foreground">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
                aria-label={tc('dismiss')}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
