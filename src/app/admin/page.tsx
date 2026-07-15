'use client';

/**
 * Admin Dashboard
 *
 * Zeigt Statistiken: Tracks, Users, Plays + erweiterte Stats.
 *
 * Layout-Regel (Flow):
 * - Top-KPIs in kompaktem 4-Spalten-Grid (Desktop) / 2x2 (Mobile)
 * - Big-Numbers (font-black) + leises Label (text-muted)
 * - Details folgen darunter — scrollen nur innerhalb des Admin-Main-Containers
 */

import { useState, useEffect } from 'react';
import {
  Music2,
  Users,
  PlayCircle,
  Disc3,
  Clock,
  TrendingUp,
  Bot,
  Vote,
  Zap,
} from 'lucide-react';
import BoomyPoolStatus from '@/components/admin/BoomyPoolStatus';
import { AdminPageHeader, AdminCard } from '@/components/admin/ui';

interface StatsData {
  overview: {
    totalTracks: number;
    publishedTracks: number;
    draftTracks: number;
    archivedTracks: number;
    totalUsers: number;
    totalPlays: number;
  };
  trackTypes: {
    local: number;
    soundcloud: number;
  };
  topTracks: Array<{
    id: string;
    title: string;
    plays: number;
    type: string;
    artist: string;
  }>;
  recentTracks: Array<{
    id: string;
    title: string;
    status: string;
    type: string;
    createdAt: string;
    artist: string;
  }>;
  genres: Array<{ name: string; count: number }>;
  roles: Array<{ name: string; count: number }>;
  poolTracks: number;
  votingStats: {
    totalVotes: number;
    averageSusPercentage: number;
  };
}

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: 'bg-rasta-green/20 text-rasta-green',
  DRAFT: 'bg-rasta-yellow/20 text-rasta-yellow',
  ARCHIVED: 'bg-elevated text-muted',
};

/** Formatierte Big-Number (z. B. 12.300 → "12.3k"). Lokalisiert nicht, weil UI en-US ist. */
function formatBigNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(0)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setStats(json.data);
      })
      .catch((err) => console.error('Dashboard stats error:', err))
      .finally(() => setLoading(false));
  }, []);

  // Top-KPI-Karten — immer 4, Desktop in einer Reihe sichtbar
  const statCards = [
    {
      label: 'Total Tracks',
      value: stats?.overview.totalTracks ?? 0,
      icon: Music2,
      color: 'text-rasta-green',
      bg: 'bg-rasta-green/10',
    },
    {
      label: 'Published',
      value: stats?.overview.publishedTracks ?? 0,
      icon: Disc3,
      color: 'text-rasta-yellow',
      bg: 'bg-rasta-yellow/10',
    },
    {
      label: 'Users',
      value: stats?.overview.totalUsers ?? 0,
      icon: Users,
      color: 'text-foreground',
      bg: 'bg-elevated',
    },
    {
      label: 'Total Plays',
      value: stats?.overview.totalPlays ?? 0,
      icon: PlayCircle,
      color: 'text-rasta-red',
      bg: 'bg-rasta-red/10',
    },
  ];

  const maxPlays = stats?.topTracks?.[0]?.plays || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        kickerTag="/D/"
        kicker="CONTROL ROOM"
        title="DASHBOARD"
        actions={
          <p className="text-xs text-muted hidden sm:block">Live stats · updates on reload</p>
        }
      />

      {/* Top-KPI-Grid — Mobile 2x2, ab sm 4 Spalten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const display = loading
            ? '...'
            : typeof card.value === 'number'
              ? formatBigNumber(card.value)
              : card.value;
          return (
            <AdminCard key={card.label}>
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs sm:text-sm text-muted truncate">{card.label}</span>
                <div
                  className={`w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-lg ${card.bg} flex items-center justify-center`}
                >
                  <Icon size={18} className={card.color} />
                </div>
              </div>
              <p className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl tabular-nums leading-tight">
                {display}
              </p>
            </AdminCard>
          );
        })}
      </div>

      {/* Secondary-KPIs: Boomy Pool + Voting — kompakt, gleiche Reihe auf Desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BoomyPoolStatus variant="compact" />

        <AdminCard>
          <div className="flex items-center gap-2 mb-3">
            <Vote size={16} className="text-rasta-yellow" />
            <h2 className="font-heading font-semibold text-sm">Voting</h2>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-heading font-black tabular-nums leading-none">
                  {loading ? '...' : formatBigNumber(stats?.votingStats?.totalVotes ?? 0)}
                </p>
                <p className="text-xs text-muted mt-1">Total Votes</p>
              </div>
              <div>
                <p className="text-2xl font-heading font-black tabular-nums leading-none">
                  {loading
                    ? '...'
                    : `${Math.round(stats?.votingStats?.averageSusPercentage ?? 0)}%`}
                </p>
                <p className="text-xs text-muted mt-1">Avg. Sus</p>
              </div>
            </div>
            {/* Link im AdminButton-accent-Look (Anker statt Button, gleiche Klassen) */}
            <a
              href="/admin/votes"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg kbk-obsidian polished framed kbk-frame-yellow text-rasta-yellow transition-all duration-200 whitespace-nowrap"
            >
              Details
            </a>
          </div>
        </AdminCard>
      </div>

      {/* Top Tracks + Recent Tracks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Played Tracks */}
        <AdminCard>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-rasta-green" />
            <h2 className="font-heading font-semibold text-base">Top Played Tracks</h2>
          </div>
          {loading ? (
            <p className="text-muted text-sm">Loading...</p>
          ) : !stats?.topTracks?.length ? (
            <p className="text-muted text-sm">No plays recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {stats.topTracks.slice(0, 5).map((track, i) => (
                <div key={track.id} className="flex items-center gap-3">
                  <span className="w-5 text-center font-heading font-bold text-muted text-xs">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{track.title}</p>
                    <p className="text-xs text-muted truncate">{track.artist}</p>
                  </div>
                  <div className="w-24 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-kbk-dark-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(track.plays / maxPlays) * 100}%`,
                          background: 'var(--gradient-progress)',
                        }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted w-8 text-right">
                      {track.plays}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        {/* Recent Tracks */}
        <AdminCard>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-rasta-yellow" />
            <h2 className="font-heading font-semibold text-base">Recent Tracks</h2>
          </div>
          {loading ? (
            <p className="text-muted text-sm">Loading...</p>
          ) : !stats?.recentTracks?.length ? (
            <p className="text-muted text-sm">No tracks yet.</p>
          ) : (
            <div className="space-y-2.5">
              {stats.recentTracks.slice(0, 5).map((track) => (
                <div key={track.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{track.title}</p>
                      {track.type === 'SOUNDCLOUD' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-secondary shrink-0">
                          SC
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted">{track.artist}</p>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${
                      STATUS_STYLES[track.status] || 'bg-elevated text-muted'
                    }`}
                  >
                    {track.status === 'PUBLISHED'
                      ? 'Live'
                      : track.status === 'DRAFT'
                        ? 'Draft'
                        : 'Archived'}
                  </span>
                  <span className="text-xs text-muted tabular-nums shrink-0">
                    {new Date(track.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      </div>

      {/* Track Types + Genres (optional expandierbar künftig, aktuell kompakt) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdminCard>
          <h2 className="font-heading font-semibold text-base mb-4">Track Types</h2>
          {loading ? (
            <p className="text-muted text-sm">Loading...</p>
          ) : (
            <div className="space-y-3">
              {[
                { label: 'Local Files', count: stats?.trackTypes.local ?? 0, color: 'bg-rasta-green' },
                { label: 'SoundCloud', count: stats?.trackTypes.soundcloud ?? 0, color: 'bg-rasta-yellow' },
              ].map((type) => {
                const total = (stats?.trackTypes.local ?? 0) + (stats?.trackTypes.soundcloud ?? 0);
                const pct = total > 0 ? (type.count / total) * 100 : 0;
                return (
                  <div key={type.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{type.label}</span>
                      <span className="text-muted tabular-nums">
                        {type.count} ({Math.round(pct)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-kbk-dark-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${type.color}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>

        <AdminCard>
          <h2 className="font-heading font-semibold text-base mb-4">Genres</h2>
          {loading ? (
            <p className="text-muted text-sm">Loading...</p>
          ) : !stats?.genres?.length ? (
            <p className="text-muted text-sm">No genre data available.</p>
          ) : (
            <div className="space-y-2.5">
              {stats.genres.slice(0, 5).map((genre) => {
                const maxGenre = stats.genres[0].count;
                const pct = (genre.count / maxGenre) * 100;
                return (
                  <div key={genre.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{genre.name}</span>
                      <span className="text-muted tabular-nums">{genre.count}</span>
                    </div>
                    <div className="h-1.5 bg-kbk-dark-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: 'var(--gradient-progress)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>
      </div>

      {/* Quick Actions — Kacheln bleiben <a>, tragen aber die AdminCard-Optik (padding sm) */}
      <AdminCard>
        <h2 className="font-heading font-semibold text-base mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <a
            href="/admin/tracks"
            className="flex items-center gap-3 p-4 rounded-xl kbk-obsidian kbk-card-hover transition-all"
          >
            <Music2 size={20} className="text-rasta-green shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">Manage Tracks</p>
              <p className="text-xs text-muted truncate">Upload, edit, publish</p>
            </div>
          </a>
          <a
            href="/admin/boomy-pool"
            className="flex items-center gap-3 p-4 rounded-xl kbk-obsidian kbk-card-hover transition-all"
          >
            <Bot size={20} className="text-violet-400 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">Boomy Pool</p>
              <p className="text-xs text-muted truncate">SUNO tracks</p>
            </div>
          </a>
          <a
            href="/admin/votes"
            className="flex items-center gap-3 p-4 rounded-xl kbk-obsidian kbk-card-hover transition-all"
          >
            <Zap size={20} className="text-rasta-yellow shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">Votes & Stats</p>
              <p className="text-xs text-muted truncate">aura+ and sus votes</p>
            </div>
          </a>
          <a
            href="/admin/users"
            className="flex items-center gap-3 p-4 rounded-xl kbk-obsidian kbk-card-hover transition-all"
          >
            <Users size={20} className="text-foreground shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">Manage Users</p>
              <p className="text-xs text-muted truncate">Roles, accounts</p>
            </div>
          </a>
        </div>
      </AdminCard>
    </div>
  );
}
