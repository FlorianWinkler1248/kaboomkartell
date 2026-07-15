'use client'

/**
 * PoolCard — Kompakte Karten-Darstellung eines Pools
 *
 * Zeigt Name (groß), Track-Count, Genre-Tag und Active-Toggle.
 * Hover zeigt Edit-Icon, Click öffnet den Track-Manager.
 * Color-Code folgt dem gleichen Farbschema wie UpcomingTimetable/Radio-Grid.
 */

import { Layers, Music2, Clock, Edit3, AlertTriangle, Trash2 } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import { RADIO_CONFIG } from '@/lib/constants'
import { AdminCard } from '@/components/admin/ui'

export interface PoolCardData {
  id: string
  name: string
  slug: string
  description: string | null
  genre: string | null
  isActive: boolean
  trackCount: number
  totalTrackCount: number
  totalDuration: number
  slotCount: number
  createdAt: string
}

interface PoolCardProps {
  pool: PoolCardData
  colorClass: string
  onOpen: (poolId: string) => void
  onToggleActive: (poolId: string, next: boolean) => void
  onDelete: (poolId: string, name: string) => void
}

export default function PoolCard({ pool, colorClass, onOpen, onToggleActive, onDelete }: PoolCardProps) {
  const durationMinutes = pool.totalDuration / 60
  const isShort = durationMinutes < RADIO_CONFIG.minPoolDurationMinutes && pool.trackCount > 0

  return (
    <AdminCard
      padding="none"
      className={cn(
        'group relative overflow-hidden kbk-card-hover cursor-pointer',
        !pool.isActive && 'opacity-70'
      )}
      onClick={() => onOpen(pool.id)}
      title={pool.description || pool.name}
    >
      {/* Cover/Placeholder mit Farb-Code */}
      <div className={cn('relative h-24 flex items-center justify-center border-b border-border', colorClass)}>
        <Layers className="opacity-50" size={36} />
        {/* Edit-Hover-Icon */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="p-1.5 bg-background/70 backdrop-blur-sm rounded-lg">
            <Edit3 size={14} className="text-foreground" />
          </div>
        </div>
        {/* Inactive-Badge */}
        {!pool.isActive && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-background/80 text-rasta-red-light backdrop-blur-sm">
            INACTIVE
          </span>
        )}
      </div>

      {/* Inhalt */}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-foreground text-base leading-tight truncate flex-1">
            {pool.name}
          </h3>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Music2 size={10} /> {pool.trackCount} tracks
          </span>
          <span className="flex items-center gap-1">
            <Clock size={10} /> {formatTime(pool.totalDuration)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {pool.genre && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-kbk-dark-700 border border-border text-secondary">
              {pool.genre}
            </span>
          )}
          {pool.slotCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rasta-green/15 text-rasta-green">
              {pool.slotCount} slot{pool.slotCount === 1 ? '' : 's'}
            </span>
          )}
          {isShort && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rasta-yellow/15 text-rasta-yellow">
              <AlertTriangle size={9} /> short
            </span>
          )}
        </div>

        {/* Toggle + Delete */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          {/* Active-Toggle — KBK-Look: dunkler Track, rasta-green + Glow wenn aktiv */}
          <label
            className="flex items-center gap-3 cursor-pointer shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleActive(pool.id, !pool.isActive)
              }}
              className={cn(
                'relative w-10 h-5 rounded-full transition-all duration-200 shrink-0 border',
                pool.isActive
                  ? 'bg-rasta-green/25 border-rasta-green/60 shadow-[0_0_10px_rgba(63,207,74,0.35)]'
                  : 'bg-kbk-dark-700 border-border'
              )}
              aria-label={pool.isActive ? 'Deactivate pool' : 'Activate pool'}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200',
                  pool.isActive
                    ? 'translate-x-[22px] bg-rasta-green shadow-[0_0_6px_rgba(63,207,74,0.7)]'
                    : 'translate-x-0 bg-muted'
                )}
              />
            </button>
            <span className="text-xs text-muted select-none">{pool.isActive ? 'Active' : 'Inactive'}</span>
          </label>

          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(pool.id, pool.name)
            }}
            className="p-1.5 text-muted hover:text-rasta-red rounded-lg transition-colors cursor-pointer"
            title="Delete pool"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </AdminCard>
  )
}
