'use client'

/**
 * Admin Pools — Verwaltungsseite für Radio-Pools
 *
 * Pools erstellen, Tracks zuweisen, Pool-Stats anzeigen.
 * Darstellung als Karten-Grid mit Cover-Placeholder, Track-Count, Genre-Tag
 * und Active-Toggle direkt auf der Card. Track-Verwaltung läuft über einen
 * zweispaltigen Modal-View (Pool-Tracks vs. Add-Tracks mit Search + Filter).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  Loader2,
  X,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GENRES } from '@/lib/constants'
import { useToast } from '@/components/providers/ToastProvider'
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
  adminSelectClass,
} from '@/components/admin/ui'
import PoolCard, { type PoolCardData } from '@/components/admin/pools/PoolCard'
import PoolTrackManager, {
  type PoolTrackData,
  type TrackOption,
} from '@/components/admin/pools/PoolTrackManager'
import PoolsEmptyState from '@/components/admin/pools/PoolsEmptyState'

// Pool-Farben: gleiches Schema wie UpcomingTimetable/Radio-Grid
const POOL_COLORS = [
  'bg-rasta-green/15 text-rasta-green',
  'bg-blue-500/15 text-blue-400',
  'bg-purple-500/15 text-purple-400',
  'bg-amber-500/15 text-amber-400',
  'bg-pink-500/15 text-pink-400',
  'bg-cyan-500/15 text-cyan-400',
  'bg-rasta-red/15 text-rasta-red',
]

export default function AdminPoolsPage() {
  const { toast } = useToast()
  const [pools, setPools] = useState<PoolCardData[]>([])
  const [loading, setLoading] = useState(true)

  // Filter (Pool-Liste)
  const [listSearch, setListSearch] = useState('')
  const [listGenre, setListGenre] = useState('')

  // Erstellen-Formular
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    genre: '',
    ownerArtistId: '',
  })
  const [creating, setCreating] = useState(false)
  // Künstler-Dropdown für ownerArtistId (Pool gehört externem Künstler)
  const [artistOptions, setArtistOptions] = useState<{ id: string; username: string; displayName: string | null }[]>([])

  // Track-Manager (Modal)
  const [managedPoolId, setManagedPoolId] = useState<string | null>(null)
  const [poolTracks, setPoolTracks] = useState<PoolTrackData[]>([])
  const [allTracks, setAllTracks] = useState<TrackOption[]>([])
  const [loadingTracks, setLoadingTracks] = useState(false)

  const loadPools = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pools')
      const json = await res.json()
      if (json.success) {
        setPools(json.data)
      } else {
        toast({ message: json.error || 'Error loading pools.', type: 'error' })
      }
    } catch (e) {
      console.error('Fehler beim Laden der Pools:', e)
      toast({ message: 'Error loading pools.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  const loadAllTracks = useCallback(async () => {
    try {
      const res = await fetch('/api/tracks?pageSize=500&isPublic=true')
      const json = await res.json()
      if (json.success) {
        // Nur LOCAL-Tracks (SoundCloud kann nicht im Radio laufen)
        setAllTracks(
          json.data.filter(
            (t: TrackOption & { trackType: string }) => t.trackType !== 'SOUNDCLOUD'
          )
        )
      } else {
        toast({ message: json.error || 'Error loading tracks.', type: 'error' })
      }
    } catch (e) {
      console.error('Fehler beim Laden der Tracks:', e)
      toast({ message: 'Error loading tracks.', type: 'error' })
    }
  }, [toast])

  useEffect(() => {
    loadPools()
    loadAllTracks()
  }, [loadPools, loadAllTracks])

  // Pool-Farb-Map (nach Position in Sortierung, damit konsistent)
  const poolColorMap = useMemo(() => {
    const map = new Map<string, string>()
    pools.forEach((pool, i) => {
      map.set(pool.id, POOL_COLORS[i % POOL_COLORS.length])
    })
    return map
  }, [pools])

  // Gefilterte Pool-Liste
  const filteredPools = useMemo(() => {
    let filtered = pools
    if (listSearch) {
      const q = listSearch.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
      )
    }
    if (listGenre) {
      filtered = filtered.filter((p) => p.genre === listGenre)
    }
    return filtered
  }, [pools, listSearch, listGenre])

  // Künstler-Optionen laden (für Owner-Dropdown)
  const loadArtists = useCallback(async () => {
    try {
      const res = await fetch('/api/users')
      const json = await res.json()
      if (json.success && json.data) {
        // Nur KUENSTLER + ADMIN als mögliche Pool-Owner
        type ApiUser = { id: string; username: string; displayName: string | null; role: string }
        setArtistOptions(
          (json.data as ApiUser[])
            .filter((u) => u.role === 'KUENSTLER' || u.role === 'ADMIN')
            .map((u) => ({ id: u.id, username: u.username, displayName: u.displayName }))
        )
      }
    } catch (e) {
      // Owner-Dropdown ist optional — Fehler nur loggen, Seite bleibt nutzbar
      console.error('Artists laden Fehler:', e)
      toast({ message: 'Error loading artist options.', type: 'error' })
    }
  }, [toast])

  useEffect(() => {
    loadArtists()
  }, [loadArtists])

  // Pool erstellen
  const handleCreate = async () => {
    if (!createForm.name.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description || undefined,
          genre: createForm.genre || undefined,
          ownerArtistId: createForm.ownerArtistId || undefined,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast({ message: 'Pool created!', type: 'success' })
        setCreateForm({
          name: '',
          description: '',
          genre: '',
          ownerArtistId: '',
        })
        setShowCreate(false)
        loadPools()
      } else {
        toast({ message: json.error || 'Error creating pool.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setCreating(false)
    }
  }

  // Pool löschen
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete pool "${name}"?`)) return
    try {
      const res = await fetch(`/api/admin/pools/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        toast({ message: 'Pool deleted.', type: 'success' })
        loadPools()
      } else {
        toast({ message: json.error || 'Error deleting pool.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    }
  }

  // Active-Toggle
  const handleToggleActive = async (id: string, next: boolean) => {
    // Optimistic Update
    setPools((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: next } : p)))
    try {
      const res = await fetch(`/api/admin/pools/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      })
      const json = await res.json()
      if (!json.success) {
        // Rollback
        setPools((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: !next } : p)))
        toast({ message: json.error || 'Error updating pool.', type: 'error' })
      } else {
        toast({
          message: next ? 'Pool activated.' : 'Pool deactivated.',
          type: 'success',
        })
      }
    } catch {
      setPools((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: !next } : p)))
      toast({ message: 'Network error.', type: 'error' })
    }
  }

  // Pool-Tracks laden & Manager öffnen
  const handleOpenManager = async (poolId: string) => {
    setManagedPoolId(poolId)
    setLoadingTracks(true)
    try {
      const res = await fetch(`/api/admin/pools/${poolId}`)
      const json = await res.json()
      if (json.success) setPoolTracks(json.data.tracks || [])
    } catch {
      toast({ message: 'Error loading pool tracks.', type: 'error' })
    } finally {
      setLoadingTracks(false)
    }
  }

  const handleCloseManager = () => {
    setManagedPoolId(null)
    setPoolTracks([])
    // Pool-Liste neu laden — Track-Counts könnten sich geändert haben
    loadPools()
  }

  // Einzelnen Track hinzufügen
  const handleAddTrack = async (trackId: string) => {
    if (!managedPoolId) return
    try {
      const res = await fetch(`/api/admin/pools/${managedPoolId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds: [trackId] }),
      })
      const json = await res.json()
      if (json.success) {
        toast({ message: 'Track added!', type: 'success' })
        // Pool-Tracks refresh
        const refresh = await fetch(`/api/admin/pools/${managedPoolId}`)
        const refreshJson = await refresh.json()
        if (refreshJson.success) setPoolTracks(refreshJson.data.tracks || [])
      } else {
        toast({ message: json.error || 'Error adding track.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    }
  }

  // Einzelnen Track entfernen
  const handleRemoveTrack = async (trackId: string) => {
    if (!managedPoolId) return
    try {
      const res = await fetch(`/api/admin/pools/${managedPoolId}/tracks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
      })
      const json = await res.json()
      if (json.success) {
        toast({ message: 'Track removed.', type: 'success' })
        setPoolTracks((prev) => prev.filter((pt) => pt.track.id !== trackId))
      } else {
        toast({ message: json.error || 'Error removing track.', type: 'error' })
      }
    } catch {
      toast({ message: 'Error removing track.', type: 'error' })
    }
  }

  // Aktuell verwalteter Pool (für Modal-Header)
  const managedPool = managedPoolId ? pools.find((p) => p.id === managedPoolId) : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-muted" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        kickerTag="/P/"
        kicker="ROTATION SOURCE"
        title="POOLS"
        description={`${pools.length} pool${pools.length === 1 ? '' : 's'} feeding the radio rotation.`}
        actions={
          pools.length > 0 ? (
            <AdminButton
              variant={showCreate ? 'ghost' : 'primary'}
              onClick={() => setShowCreate(!showCreate)}
            >
              {showCreate ? <X size={16} /> : <Plus size={16} />}
              {showCreate ? 'Cancel' : 'New Pool'}
            </AdminButton>
          ) : undefined
        }
      />

      {/* Erstellen-Formular — die eine Akzent-Karte der Seite, wenn offen */}
      {showCreate && (
        <AdminCard framed className="space-y-4">
          <h3 className="font-semibold text-foreground">Create Pool</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Name *</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
                placeholder="Phonk Rotation"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Genre</label>
              <select
                value={createForm.genre}
                onChange={(e) => setCreateForm({ ...createForm, genre: e.target.value })}
                className={cn(adminSelectClass, 'w-full')}
              >
                <option value="">All Genres</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-muted mb-1">Description</label>
              <input
                type="text"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
                placeholder="Dark Phonk tracks for late night rotation"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Owner Artist</label>
              <select
                value={createForm.ownerArtistId}
                onChange={(e) => setCreateForm({ ...createForm, ownerArtistId: e.target.value })}
                className={cn(adminSelectClass, 'w-full')}
              >
                <option value="">— (KBK default pool)</option>
                {artistOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName || a.username} (@{a.username})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <AdminButton
            onClick={handleCreate}
            disabled={creating || !createForm.name.trim()}
            isLoading={creating}
          >
            Create Pool
          </AdminButton>
        </AdminCard>
      )}

      {/* Pool-Liste */}
      {pools.length === 0 ? (
        <PoolsEmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <>
          {/* Filter-Leiste */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                size={14}
              />
              <input
                type="text"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Search pools..."
                className={cn(adminInputClass, 'w-full pl-9')}
              />
            </div>
            <select
              value={listGenre}
              onChange={(e) => setListGenre(e.target.value)}
              className={adminSelectClass}
            >
              <option value="">All Genres</option>
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {filteredPools.length === 0 ? (
            <div className="text-center py-10 text-muted text-sm">
              No pools match the filters.
            </div>
          ) : (
            <div
              className={cn(
                'grid gap-4',
                'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              )}
            >
              {filteredPools.map((pool) => (
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  colorClass={poolColorMap.get(pool.id) || POOL_COLORS[0]}
                  onOpen={handleOpenManager}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Track-Manager-Modal */}
      {managedPoolId && managedPool && (
        <PoolTrackManager
          poolName={managedPool.name}
          poolTracks={poolTracks}
          allTracks={allTracks}
          loadingTracks={loadingTracks}
          onClose={handleCloseManager}
          onAddTrack={handleAddTrack}
          onRemoveTrack={handleRemoveTrack}
        />
      )}
    </div>
  )
}
