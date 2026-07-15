'use client';

/**
 * VotingDialog — Abstimmungs-Banner für Tracks
 *
 * Wird nach 60 Sekunden Hörzeit eingeblendet und erlaubt dem User,
 * einen Track mit "aura+" (Qualität) und/oder "sus?" (KI-Verdacht)
 * zu bewerten. Slide-Down-Animation mit Glassmorphism-Effekt.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Zap, Eye, X, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

interface VotingDialogProps {
  trackId: string;
  trackTitle: string;
  onVoteSubmitted: () => void;
  onDismiss: () => void;
}

export default function VotingDialog({
  trackId,
  trackTitle,
  onVoteSubmitted,
  onDismiss,
}: VotingDialogProps) {
  const t = useTranslations('playerUi');
  const router = useRouter();
  const { toast } = useToast();
  // Sichtbarkeit für Slide-Down-Animation
  const [visible, setVisible] = useState(false);
  // Voting-State: ob aura+ und/oder sus? ausgewählt
  const [auraSelected, setAuraSelected] = useState(false);
  const [susSelected, setSusSelected] = useState(false);
  // Lade- und Erfolgszustände
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingVote, setIsCheckingVote] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);

  // Prüfen ob der User bereits für diesen Track abgestimmt hat
  useEffect(() => {
    let cancelled = false;

    async function checkExistingVote() {
      try {
        const res = await fetch(`/api/tracks/${trackId}/vote`);
        if (!res.ok) {
          // Kein Vote gefunden oder Fehler — Dialog anzeigen
          if (!cancelled) {
            setIsCheckingVote(false);
            // Animation nach kurzem Delay starten
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (!cancelled) setVisible(true);
              });
            });
          }
          return;
        }
        const data = await res.json();
        if (data.data?.hasVoted) {
          // User hat bereits abgestimmt — Dialog nicht anzeigen
          if (!cancelled) onDismiss();
        } else {
          if (!cancelled) {
            setIsCheckingVote(false);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (!cancelled) setVisible(true);
              });
            });
          }
        }
      } catch {
        // Bei Fehler: Dialog trotzdem anzeigen
        if (!cancelled) {
          setIsCheckingVote(false);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!cancelled) setVisible(true);
            });
          });
        }
      }
    }

    checkExistingVote();
    return () => { cancelled = true; };
  }, [trackId, onDismiss]);

  // Vote absenden
  const handleSubmitVote = useCallback(async () => {
    if (!auraSelected && !susSelected) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/tracks/${trackId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aura: auraSelected,
          sus: susSelected,
        }),
      });

      if (res.ok) {
        // Erfolgs-Feedback kurz anzeigen, dann schließen
        setShowSuccess(true);
        setTimeout(() => {
          onVoteSubmitted();
        }, 1500);
      } else if (res.status === 401 || res.status === 403) {
        // Nicht eingeloggt: DER Conversion-Moment (ADR-035 P0.4). Bisher verpuffte
        // der Vote-Versuch still — jetzt Feedback + Weg zum Login mit Rücksprung
        // auf die aktuelle Seite (callbackUrl, Open-Redirect-Schutz in /login).
        toast({ type: 'info', message: t('voteLoginRequired') });
        const cb = encodeURIComponent(window.location.pathname + window.location.search);
        setTimeout(() => router.push(`/login?callbackUrl=${cb}`), 1200);
      } else {
        toast({ type: 'error', message: t('voteFailed') });
      }
    } catch {
      // Netzwerk-/Parsing-Fehler: ehrliches Feedback statt stillem Schlucken.
      toast({ type: 'error', message: t('voteFailed') });
    } finally {
      setIsLoading(false);
    }
  }, [trackId, auraSelected, susSelected, onVoteSubmitted, toast, t, router]);

  // Dialog mit Animation schließen
  const handleDismiss = useCallback(() => {
    setVisible(false);
    // Warten bis Animation fertig, dann Callback
    setTimeout(() => {
      onDismiss();
    }, 500);
  }, [onDismiss]);

  // Während der Vote-Prüfung nichts anzeigen
  if (isCheckingVote) return null;

  return (
    <div
      className={cn(
        'transform transition-all duration-500 ease-out',
        'relative overflow-hidden rounded-lg',
        'bg-black/60 backdrop-blur-xl border border-white/10',
        'shadow-2xl shadow-black/40',
        'p-4 mx-2 mb-3',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      )}
    >
      {/* Schließen-Button */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
        aria-label={t('closeVotingDialog')}
      >
        <X className="w-4 h-4" />
      </button>

      {showSuccess ? (
        // Erfolgs-Anzeige nach dem Abstimmen
        <div className="flex items-center justify-center gap-2 py-2">
          <CheckCircle className="w-5 h-5 text-rasta-green" />
          <span className="text-white/90 text-sm font-medium">
            {t('voteSubmitted')}
          </span>
        </div>
      ) : (
        <>
          {/* Überschrift */}
          <p className="text-white/80 text-sm mb-3 pr-6">
            {t('votingQuestion', { trackTitle })}
          </p>

          {/* Voting-Buttons */}
          <div className="flex items-center gap-3 mb-2">
            {/* aura+ Button */}
            <button
              onClick={() => setAuraSelected((prev) => !prev)}
              disabled={isLoading}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
                'transition-all duration-200',
                auraSelected
                  ? 'bg-rasta-green text-white shadow-lg shadow-rasta-green/30'
                  : 'border border-rasta-green/30 text-rasta-green hover:bg-rasta-green/10'
              )}
            >
              <Zap className="w-4 h-4" />
              aura+
            </button>

            {/* sus? Button */}
            <button
              onClick={() => setSusSelected((prev) => !prev)}
              disabled={isLoading}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
                'transition-all duration-200',
                susSelected
                  ? 'bg-rasta-red text-white shadow-lg shadow-rasta-red/30'
                  : 'border border-rasta-red/30 text-rasta-red hover:bg-rasta-red/10'
              )}
            >
              <Eye className="w-4 h-4" />
              sus?
            </button>

            {/* Absenden-Button — nur sichtbar wenn mindestens eine Option gewählt */}
            {(auraSelected || susSelected) && (
              <button
                onClick={handleSubmitVote}
                disabled={isLoading}
                className={cn(
                  'ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm',
                  'bg-white/10 text-white/80 hover:bg-white/20 transition-colors',
                  'disabled:opacity-50'
                )}
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  t('submit')
                )}
              </button>
            )}
          </div>

          {/* Hinweistext */}
          <p className="text-white/40 text-xs">
            {t('voteHint')}
          </p>
        </>
      )}
    </div>
  );
}
