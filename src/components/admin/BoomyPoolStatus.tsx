'use client';

/**
 * BoomyPoolStatus
 *
 * Compact-Widget für den Admin-Bereich. Zeigt Boomys Release-Queue (KI-Tracks,
 * die noch nicht öffentlich sind), warnt unterhalb der Schwelle
 * (BOOMY_CONFIG.poolLowThreshold) und sagt an, ob Boomy heute etwas zu
 * releasen hat.
 *
 * Wird verwendet auf:
 * - /admin/boomy-pool (oben als Header-Strip, variant='full')
 * - /admin (Dashboard, variant='compact')
 */

import { useEffect, useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { AdminCard } from '@/components/admin/ui';

interface GenreStat {
  genre: string;
  waiting: number;
  live: number;
}

interface StatsResponse {
  threshold: number;
  releaseIntervalDays: number;
  waitingTracks: number;
  publicTracks: number;
  byGenre: GenreStat[];
  belowThreshold: boolean;
  hasReleaseCandidate: boolean;
}

interface Props {
  variant?: 'full' | 'compact';
}

export default function BoomyPoolStatus({ variant = 'full' }: Props) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/boomy-stats')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setStats(json.data);
      })
      .catch((err) => console.error('Boomy stats error:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AdminCard className="flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-400" size={20} />
      </AdminCard>
    );
  }

  if (!stats) {
    return (
      <AdminCard className="text-sm text-muted">Boomy stats not available.</AdminCard>
    );
  }

  const daysCoverage = Math.floor(stats.waitingTracks * stats.releaseIntervalDays);

  // === Compact-Variante (Dashboard) ===
  if (variant === 'compact') {
    return (
      <AdminCard>
        <div className="flex items-center gap-2 mb-3">
          <Bot size={16} className="text-violet-400" />
          <h2 className="font-heading font-semibold text-sm">Boomy Release Status</h2>
        </div>

        <div className="flex items-end justify-between gap-4 mb-3">
          <div>
            <p className="text-3xl font-heading font-black tabular-nums leading-none">
              {stats.waitingTracks}
            </p>
            <p className="text-xs text-muted mt-1">
              AI tracks queued · ~{daysCoverage} days
            </p>
          </div>
          {/* Link im AdminButton-secondary-Look (Anker statt Button, gleiche Klassen) */}
          <Link
            href="/admin/boomy-pool"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg kbk-obsidian polished text-rasta-green transition-all duration-200 whitespace-nowrap"
          >
            Manage
          </Link>
        </div>

        {stats.byGenre.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {stats.byGenre.map((g) => (
              <div
                key={g.genre}
                className="rounded-lg border border-border bg-elevated px-2 py-1.5 text-center"
              >
                <p className="text-[10px] text-muted uppercase tracking-wider truncate">
                  {g.genre}
                </p>
                <p className="font-heading font-bold tabular-nums text-lg text-foreground">
                  {g.waiting}
                </p>
              </div>
            ))}
          </div>
        )}

        {stats.belowThreshold && (
          <div className="mt-3 flex items-center gap-2 text-xs text-rasta-red">
            <AlertCircle size={14} />
            Queue below {stats.threshold} tracks
          </div>
        )}
      </AdminCard>
    );
  }

  // === Full-Variante (Boomy-Pool-Page Header) ===
  return (
    <AdminCard className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div>
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            <Bot size={18} className="text-violet-400" />
            Release Queue — {stats.waitingTracks} AI track{stats.waitingTracks !== 1 && 's'} queued
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Boomy releases one queued AI track every {stats.releaseIntervalDays} days. Alert threshold: {stats.threshold} tracks.
          </p>
        </div>

        {stats.hasReleaseCandidate ? (
          <span className="flex items-center gap-1.5 text-xs text-rasta-green">
            <CheckCircle2 size={14} />
            ready to release
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-rasta-red">
            <AlertCircle size={14} />
            no candidates
          </span>
        )}
      </div>

      {/* Pro Genre: wartende vs. öffentliche KI-Tracks */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.byGenre.map((g) => (
          <div key={g.genre} className="rounded-lg bg-elevated border border-border p-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 truncate">
              {g.genre}
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-heading font-black tabular-nums">
                {g.waiting}
              </span>
              <span className="text-xs text-muted">waiting</span>
            </div>
            <p className="text-[11px] text-muted mt-0.5">{g.live} live</p>
          </div>
        ))}
        {stats.byGenre.length === 0 && (
          <p className="text-sm text-muted col-span-full">No AI tracks yet.</p>
        )}
      </div>

      {stats.belowThreshold && (
        <div className="mt-4 p-3 rounded-lg bg-rasta-red/10 border border-rasta-red/30 flex items-start gap-2">
          <AlertCircle size={16} className="text-rasta-red mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-rasta-red">
              Release queue below threshold ({stats.threshold} tracks)
            </p>
            <p className="text-xs text-muted mt-0.5">
              Only {stats.waitingTracks} AI track{stats.waitingTracks !== 1 && 's'} waiting — upload more to keep Boomy dropping.
            </p>
          </div>
        </div>
      )}
    </AdminCard>
  );
}
