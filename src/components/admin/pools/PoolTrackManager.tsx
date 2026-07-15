'use client'

/**
 * PoolTrackManager — Zweispaltige Track-Verwaltung für einen Pool
 *
 * Links: Tracks im Pool (entfernbar, sortierbar nach Titel/Genre/BPM/Dauer)
 * Rechts: Verfügbare Tracks (hinzufügbar via "+"-Button) mit Search + Genre-Filter
 *
 * Modal-Overlay (kein externes Package).
 *
 * ANMERKUNG: Drag-&-Drop-Reorder der Pool-Tracks ist nicht umgesetzt, da das
 * Prisma-Schema aktuell kein Position-Feld auf PoolTrack hat (Pools werden per
 * Radio-Engine ohnehin geshuffled). Stattdessen Sortier-Modi für die Ansicht.
 */

import { useMemo, useState } from 'react'
import {
  X,
  Plus,
  Music2,
  Search,
  Filter,
  Loader2,
  ListMusic,
  Library,
  ArrowUpDown,
} from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import { formatArtistDisplay } from '@/lib/track-display'
import { GENRES } from '@/lib/constants'
import { AdminCard, adminInputClass, adminSelectClass } from '@/components/admin/ui'

export interface PoolTrackData {
  id: string
  track: {
    id: string
    title: string
    slug: string
    duration: number
    genre: string | null
    bpm: number | null
    status: string
    artist: { username: string; displayName: string | null }
    // v2.27: Featuring-Awareness — "4Flow feat. Boomy" sichtbar im Pool-Manager
    featuringArtist?: { username: string; displayName: string | null } | null
  }
}

export interface TrackOption {
  id: string
  title: string
  duration: number
  genre: string | null
  bpm: number | null
  artist: { username: string; displayName: string | null }
  featuringArtist?: { username: string; displayName: string | null } | null
}

interface PoolTrackManagerProps {
  poolName: string
  poolTracks: PoolTrackData[]
  allTracks: TrackOption[]
  loadingTracks: boolean
  onClose: () => void
  onAddTrack: (trackId: string) => void
  onRemoveTrack: (trackId: string) => void
}

type SortKey = 'title' | 'duration' | 'bpm' | 'genre'

export default function PoolTrackManager({
  poolName,
  poolTracks,
  allTracks,
  loadingTracks,
  onClose,
  onAddTrack,
  onRemoveTrack,
}: PoolTrackManagerProps) {
  const [leftSearch, setLeftSearch] = useState('')
  const [leftGenre, setLeftGenre] = useState('')
  const [leftSort, setLeftSort] = useState<SortKey>('title')

  const [rightSearch, setRightSearch] = useState('')
  const [rightGenre, setRightGenre] = useState('')

  // Verfügbare Tracks = alle Published LOCAL-Tracks minus Pool-Tracks
  const inPoolIds = useMemo(() => new Set(poolTracks.map((pt) => pt.track.id)), [poolTracks])

  // Linke Spalte: gefiltert + sortiert
  const filteredPoolTracks = useMemo(() => {
    let filtered = [...poolTracks]
    if (leftSearch) {
      const q = leftSearch.toLowerCase()
      filtered = filtered.filter(
        (pt) =>
          pt.track.title.toLowerCase().includes(q) ||
          formatArtistDisplay(pt.track).toLowerCase().includes(q)
      )
    }
    if (leftGenre) {
      filtered = filtered.filter((pt) => pt.track.genre === leftGenre)
    }
    // Sortieren
    filtered.sort((a, b) => {
      switch (leftSort) {
        case 'duration':
          return a.track.duration - b.track.duration
        case 'bpm':
          return (a.track.bpm || 0) - (b.track.bpm || 0)
        case 'genre':
          return (a.track.genre || '').localeCompare(b.track.genre || '')
        case 'title':
        default:
          return a.track.title.localeCompare(b.track.title)
      }
    })
    return filtered
  }, [poolTracks, leftSearch, leftGenre, leftSort])

  // Rechte Spalte: verfügbar + gefiltert
  const availableTracks = useMemo(() => {
    let filtered = allTracks.filter((t) => !inPoolIds.has(t.id))
    if (rightSearch) {
      const q = rightSearch.toLowerCase()
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          formatArtistDisplay(t).toLowerCase().includes(q)
      )
    }
    if (rightGenre) {
      filtered = filtered.filter((t) => t.genre === rightGenre)
    }
    return filtered
  }, [allTracks, inPoolIds, rightSearch, rightGenre])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <AdminCard
        framed
        padding="none"
        className="rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-rasta-green/15 flex items-center justify-center shrink-0">
              <Library className="text-rasta-green" size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-foreground text-lg truncate">{poolName}</h2>
              <p className="text-xs text-muted">{poolTracks.length} tracks in pool</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted hover:text-foreground rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Zwei-Spalten-Layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 gap-0 divide-x divide-border">
          {/* Linke Spalte: Pool-Tracks */}
          <div className="flex flex-col min-h-0">
            <div className="p-4 border-b border-border shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <ListMusic className="text-rasta-green" size={14} />
                <h3 className="text-sm font-semibold text-foreground">
                  In Pool ({filteredPoolTracks.length})
                </h3>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                    size={12}
                  />
                  <input
                    type="text"
                    value={leftSearch}
                    onChange={(e) => setLeftSearch(e.target.value)}
                    placeholder="Search pool tracks..."
                    className={cn(adminInputClass, 'w-full pl-7 pr-2 py-1.5 text-xs')}
                  />
                </div>
                <select
                  value={leftGenre}
                  onChange={(e) => setLeftGenre(e.target.value)}
                  className={cn(adminSelectClass, 'px-2 py-1.5 text-xs')}
                  aria-label="Filter by genre"
                >
                  <option value="">All</option>
                  {GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <select
                  value={leftSort}
                  onChange={(e) => setLeftSort(e.target.value as SortKey)}
                  className={cn(adminSelectClass, 'px-2 py-1.5 text-xs')}
                  aria-label="Sort"
                >
                  <option value="title">Title</option>
                  <option value="duration">Duration</option>
                  <option value="bpm">BPM</option>
                  <option value="genre">Genre</option>
                </select>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {loadingTracks ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin text-muted" size={20} />
                </div>
              ) : filteredPoolTracks.length === 0 ? (
                <div className="text-center py-8 text-muted text-sm">
                  <Music2 className="mx-auto mb-2 opacity-40" size={24} />
                  {poolTracks.length === 0
                    ? 'No tracks in this pool yet.'
                    : 'No tracks match the filters.'}
                </div>
              ) : (
                filteredPoolTracks.map((pt) => (
                  <div
                    key={pt.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-elevated/50 hover:bg-elevated rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Music2 className="text-muted shrink-0" size={12} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">{pt.track.title}</p>
                        <p className="text-[11px] text-muted truncate">
                          {formatArtistDisplay(pt.track)}
                          {pt.track.genre ? ` · ${pt.track.genre}` : ''}
                          {pt.track.bpm ? ` · ${pt.track.bpm}bpm` : ''}
                          {' · '}
                          {formatTime(pt.track.duration)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveTrack(pt.track.id)}
                      className="p-1.5 text-muted hover:text-rasta-red rounded transition-colors cursor-pointer shrink-0"
                      title="Remove from pool"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Rechte Spalte: Add Tracks */}
          <div className="flex flex-col min-h-0">
            <div className="p-4 border-b border-border shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <Plus className="text-rasta-yellow" size={14} />
                <h3 className="text-sm font-semibold text-foreground">
                  Add Tracks ({availableTracks.length})
                </h3>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                    size={12}
                  />
                  <input
                    type="text"
                    value={rightSearch}
                    onChange={(e) => setRightSearch(e.target.value)}
                    placeholder="Search tracks to add..."
                    className={cn(adminInputClass, 'w-full pl-7 pr-2 py-1.5 text-xs')}
                  />
                </div>
                <select
                  value={rightGenre}
                  onChange={(e) => setRightGenre(e.target.value)}
                  className={cn(adminSelectClass, 'px-2 py-1.5 text-xs')}
                  aria-label="Filter by genre"
                >
                  <option value="">All</option>
                  {GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {availableTracks.length === 0 ? (
                <div className="text-center py-8 text-muted text-sm">
                  <Filter className="mx-auto mb-2 opacity-40" size={24} />
                  {allTracks.length === 0
                    ? 'No published tracks available.'
                    : 'All matching tracks are already in this pool.'}
                </div>
              ) : (
                availableTracks.map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-elevated/30 hover:bg-elevated/70 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Music2 className="text-muted shrink-0" size={12} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">{track.title}</p>
                        <p className="text-[11px] text-muted truncate">
                          {formatArtistDisplay(track)}
                          {track.genre ? ` · ${track.genre}` : ''}
                          {track.bpm ? ` · ${track.bpm}bpm` : ''}
                          {' · '}
                          {formatTime(track.duration)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => onAddTrack(track.id)}
                      className="p-1.5 text-rasta-green hover:bg-rasta-green/15 rounded transition-colors cursor-pointer shrink-0"
                      title="Add to pool"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer-Hinweis */}
        <div className="px-5 py-2.5 border-t border-border shrink-0 text-[11px] text-muted flex items-center gap-2">
          <ArrowUpDown size={10} />
          Track order in pool is not significant — the radio engine shuffles on play.
        </div>
      </AdminCard>
    </div>
  )
}
