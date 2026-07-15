'use client';

/**
 * Votes — Admin-Übersichtsseite
 *
 * Zeigt Voting-Statistiken für alle Tracks:
 * - Übersichtskarten: Gesamt-Votes, Durchschnittliche Aura/Sus-Rate
 * - Track-Liste sortiert nach totalVotes (absteigend)
 * - "Likely AI"-Badge für Tracks mit >= 80% Sus-Rate
 *
 * Obsidian-Polish: AdminPageHeader + AdminCard statt flacher Surface-Container,
 * Statusfarben strikt über KBK-Tokens (grün=ok, gelb=warnung, rot=kritisch).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Vote,
  Loader2,
  Music2,
  TrendingUp,
  ShieldAlert,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatArtistDisplay } from '@/lib/track-display';
import { AdminPageHeader, AdminCard } from '@/components/admin/ui';
import { useToast } from '@/components/providers/ToastProvider';

interface TrackData {
  id: string;
  title: string;
  slug: string;
  status?: string;
  playCount: number;
  genre: string | null;
  auraCount?: number;
  susCount?: number;
  totalVotes?: number;
  susPercentage?: number;
  artist: { id: string; username: string; displayName: string | null };
  // v2.27: Featuring-Awareness für Voting-Tabelle ("4Flow feat. Boomy" sichtbar).
  featuringArtist?: { id: string; username: string; displayName: string | null } | null;
}

export default function VotesPage() {
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Tracks laden
  const loadTracks = useCallback(async () => {
    try {
      const res = await fetch('/api/tracks?pageSize=100');
      const json = await res.json();
      if (json.success) {
        setTracks(json.data || []);
      } else {
        toast({ type: 'error', message: json.error || 'Failed to load voting data.' });
      }
    } catch (err) {
      console.error('Tracks laden Fehler:', err);
      toast({ type: 'error', message: 'Failed to load voting data.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  // === Statistiken berechnen ===
  const stats = useMemo(() => {
    const tracksWithVotes = tracks.filter(
      (t) => (t.totalVotes ?? 0) > 0
    );

    const totalVotes = tracks.reduce(
      (sum, t) => sum + (t.totalVotes ?? 0),
      0
    );
    const totalAura = tracks.reduce(
      (sum, t) => sum + (t.auraCount ?? 0),
      0
    );
    const totalSus = tracks.reduce(
      (sum, t) => sum + (t.susCount ?? 0),
      0
    );

    // Durchschnittliche Raten (nur Tracks mit Votes)
    const avgAuraRate =
      tracksWithVotes.length > 0
        ? tracksWithVotes.reduce(
            (sum, t) => {
              const total = t.totalVotes ?? 0;
              return sum + (total > 0 ? ((t.auraCount ?? 0) / total) * 100 : 0);
            },
            0
          ) / tracksWithVotes.length
        : 0;

    const avgSusRate =
      tracksWithVotes.length > 0
        ? tracksWithVotes.reduce(
            (sum, t) => {
              const total = t.totalVotes ?? 0;
              return sum + (total > 0 ? ((t.susCount ?? 0) / total) * 100 : 0);
            },
            0
          ) / tracksWithVotes.length
        : 0;

    // Tracks mit >= 80% Sus
    const highSusTracks = tracks.filter((t) => {
      const total = t.totalVotes ?? 0;
      if (total === 0) return false;
      return ((t.susCount ?? 0) / total) * 100 >= 80;
    });

    return {
      totalVotes,
      totalAura,
      totalSus,
      avgAuraRate,
      avgSusRate,
      highSusCount: highSusTracks.length,
      tracksWithVotes: tracksWithVotes.length,
    };
  }, [tracks]);

  // === Sortierte Track-Liste (nach totalVotes absteigend) ===
  const sortedTracks = useMemo(() => {
    return [...tracks]
      .filter((t) => (t.totalVotes ?? 0) > 0)
      .sort((a, b) => (b.totalVotes ?? 0) - (a.totalVotes ?? 0));
  }, [tracks]);

  // === Statistik-Karte ===
  const StatCard = ({
    label,
    value,
    icon: Icon,
    color,
  }: {
    label: string;
    value: string | number;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    color: string;
  }) => (
    <AdminCard padding="sm">
      <div className="flex items-center gap-3 mb-2">
        <div className={cn('p-2 rounded-lg', color)}>
          <Icon size={18} />
        </div>
        <span className="text-sm text-muted">{label}</span>
      </div>
      <p className="text-2xl font-heading font-bold">{value}</p>
    </AdminCard>
  );

  // === Sus-Prozent-Balken ===
  const SusBar = ({ percentage }: { percentage: number }) => (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full bg-kbk-dark-700 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            percentage >= 80
              ? 'bg-gradient-to-r from-rasta-red to-rasta-red-light'
              : percentage >= 50
                ? 'bg-gradient-to-r from-rasta-yellow to-rasta-yellow-light'
                : 'bg-gradient-to-r from-rasta-green to-rasta-green-light'
          )}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted w-10 text-right">
        {percentage.toFixed(0)}%
      </span>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-rasta-green" size={32} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <AdminPageHeader
        kickerTag="/V/"
        kicker="CROWD SIGNAL"
        title="VOTES"
        description="Community voting statistics — Aura vs. Sus"
      />

      {/* Übersichtskarten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Votes"
          value={stats.totalVotes}
          icon={Vote}
          color="bg-elevated text-foreground"
        />
        <StatCard
          label="Avg. Aura Rate"
          value={`${stats.avgAuraRate.toFixed(1)}%`}
          icon={Sparkles}
          color="bg-rasta-green/10 text-rasta-green"
        />
        <StatCard
          label="Avg. Sus Rate"
          value={`${stats.avgSusRate.toFixed(1)}%`}
          icon={ShieldAlert}
          color="bg-rasta-red/10 text-rasta-red"
        />
        <StatCard
          label="80%+ Sus Tracks"
          value={stats.highSusCount}
          icon={BarChart3}
          color="bg-rasta-yellow/10 text-rasta-yellow"
        />
      </div>

      {/* Zusammenfassung */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <AdminCard padding="sm" className="text-center">
          <p className="text-3xl font-heading font-bold text-rasta-green">
            {stats.totalAura}
          </p>
          <p className="text-sm text-muted mt-1">Total Aura</p>
        </AdminCard>
        <AdminCard padding="sm" className="text-center">
          <p className="text-3xl font-heading font-bold text-rasta-red">
            {stats.totalSus}
          </p>
          <p className="text-sm text-muted mt-1">Total Sus</p>
        </AdminCard>
        <AdminCard padding="sm" className="text-center">
          <p className="text-3xl font-heading font-bold text-foreground">
            {stats.tracksWithVotes}
          </p>
          <p className="text-sm text-muted mt-1">Tracks with Votes</p>
        </AdminCard>
      </div>

      {/* Track-Voting-Tabelle */}
      <AdminCard padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            <TrendingUp size={18} className="text-rasta-green" />
            Track Voting Details
          </h2>
        </div>

        {sortedTracks.length === 0 ? (
          <div className="text-center py-12">
            <Music2 size={36} className="mx-auto text-muted mb-3" />
            <p className="text-muted">No votes yet.</p>
            <p className="text-sm text-muted/70 mt-1">
              Votes will appear here once the community starts voting.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[680px] divide-y divide-border">
              {/* Tabellen-Header */}
              <div className="grid grid-cols-[1fr_80px_80px_80px_150px_80px] gap-4 px-4 py-3 font-mono text-[11px] font-semibold text-muted uppercase tracking-[0.15em]">
                <span>Track</span>
                <span className="text-center">Aura</span>
                <span className="text-center">Sus</span>
                <span className="text-center">Total</span>
                <span>Sus %</span>
                <span className="text-right">Status</span>
              </div>

              {/* Sortierte Tracks */}
              {sortedTracks.map((track) => {
                const total = track.totalVotes ?? 0;
                const aura = track.auraCount ?? 0;
                const sus = track.susCount ?? 0;
                const susPercent = total > 0 ? (sus / total) * 100 : 0;
                const isLikelyAI = susPercent >= 80;

                return (
                  <div
                    key={track.id}
                    className={cn(
                      'grid grid-cols-[1fr_80px_80px_80px_150px_80px] gap-4 px-4 py-3 items-center hover:bg-elevated/50 transition-colors',
                      isLikelyAI && 'bg-rasta-red/5'
                    )}
                  >
                    {/* Track-Info */}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {track.title}
                      </p>
                      <p className="text-xs text-muted truncate">
                        {formatArtistDisplay(track)}
                        {track.genre && ` · ${track.genre}`}
                      </p>
                    </div>

                    {/* Aura-Zähler */}
                    <span className="text-sm text-rasta-green font-semibold tabular-nums text-center">
                      {aura}
                    </span>

                    {/* Sus-Zähler */}
                    <span className="text-sm text-rasta-red font-semibold tabular-nums text-center">
                      {sus}
                    </span>

                    {/* Gesamt-Votes */}
                    <span className="text-sm text-foreground font-semibold tabular-nums text-center">
                      {total}
                    </span>

                    {/* Sus-Prozent-Balken */}
                    <SusBar percentage={susPercent} />

                    {/* Status-Badge */}
                    <div className="flex justify-end">
                      {isLikelyAI ? (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rasta-red/10 text-rasta-red">
                          Likely AI
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rasta-green/10 text-rasta-green">
                          Clean
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
