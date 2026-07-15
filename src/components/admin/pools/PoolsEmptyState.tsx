'use client'

/**
 * PoolsEmptyState — Freundliche Anleitung für leere Pool-Liste
 *
 * Zeigt einen kurzen 3-Schritte-Leitfaden und einen CTA-Button zum
 * Anlegen des ersten Pools.
 */

import { Layers, Music2, Radio, Plus, ArrowRight } from 'lucide-react'
import { AdminCard, AdminButton } from '@/components/admin/ui'

interface PoolsEmptyStateProps {
  onCreate: () => void
}

export default function PoolsEmptyState({ onCreate }: PoolsEmptyStateProps) {
  return (
    <AdminCard padding="none" className="p-8 sm:p-10 text-center space-y-6">
      <div className="flex justify-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-rasta-green/15 flex items-center justify-center">
            <Layers className="text-rasta-green" size={40} />
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-background border-2 border-rasta-green flex items-center justify-center">
            <Plus className="text-rasta-green" size={12} />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground">No pools yet</h2>
        <p className="text-sm text-muted max-w-md mx-auto">
          Pools are shuffled collections of tracks that the radio engine plays.
          Think of them as rotations — one pool per vibe.
        </p>
      </div>

      {/* Schritte */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl mx-auto">
        <div className="bg-elevated/50 border border-border rounded-xl p-3 space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-rasta-green text-white text-[10px] font-bold flex items-center justify-center">
              1
            </span>
            <Layers className="text-muted" size={14} />
          </div>
          <p className="text-xs font-medium text-foreground">Create a pool</p>
          <p className="text-[11px] text-muted">e.g. &ldquo;Dysto Phonk&rdquo;</p>
        </div>
        <div className="bg-elevated/50 border border-border rounded-xl p-3 space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-rasta-green text-white text-[10px] font-bold flex items-center justify-center">
              2
            </span>
            <Music2 className="text-muted" size={14} />
          </div>
          <p className="text-xs font-medium text-foreground">Add tracks</p>
          <p className="text-[11px] text-muted">Browse and queue published tracks</p>
        </div>
        <div className="bg-elevated/50 border border-border rounded-xl p-3 space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-rasta-green text-white text-[10px] font-bold flex items-center justify-center">
              3
            </span>
            <Radio className="text-muted" size={14} />
          </div>
          <p className="text-xs font-medium text-foreground">Schedule it</p>
          <p className="text-[11px] text-muted">Drop it into the radio timetable</p>
        </div>
      </div>

      <AdminButton size="lg" onClick={onCreate}>
        <Plus size={16} />
        Create First Pool
        <ArrowRight size={14} />
      </AdminButton>
    </AdminCard>
  )
}
