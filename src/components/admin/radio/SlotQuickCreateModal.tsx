'use client'

/**
 * SlotQuickCreateModal — Inline-Dialog für neues/bearbeitetes Timetable-Slot
 *
 * Multi-Day-Toggle (Mo-So) damit Flow einmal klickt und alle 7 Tage belegt.
 * Start/End-Time, Pool-Dropdown, Label, Priority. Kein Full-Page-Navigate.
 */

import { useEffect, useState } from 'react'
import { X, Clock, Layers, Trash2, CalendarCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DAY_LABELS } from '@/lib/constants'
import { AdminButton, adminInputClass, adminSelectClass } from '@/components/admin/ui'

export interface SlotFormState {
  dayOfWeek: number
  startHour: number
  startMin: number
  endHour: number
  endMin: number
  label: string
  poolId: string
  priority: number
  repeatDays: number[]
}

interface PoolOption {
  id: string
  name: string
  genre: string | null
  trackCount: number
}

interface SlotQuickCreateModalProps {
  open: boolean
  editing: boolean
  initial: SlotFormState
  pools: PoolOption[]
  saving: boolean
  onClose: () => void
  onSave: (form: SlotFormState) => void
  onDelete?: () => void
}

// Montag-zuerst Reihenfolge
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function SlotQuickCreateModal({
  open,
  editing,
  initial,
  pools,
  saving,
  onClose,
  onSave,
  onDelete,
}: SlotQuickCreateModalProps) {
  const [form, setForm] = useState<SlotFormState>(initial)

  // Reset nur bei Öffnen des Modals (nicht bei jedem Render) — sonst gehen
  // User-Änderungen im Formular verloren, wenn der Parent neu rendert.
  useEffect(() => {
    if (open) setForm(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ESC-Key zum Schließen
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const toggleRepeatDay = (day: number) => {
    setForm((prev) => ({
      ...prev,
      repeatDays: prev.repeatDays.includes(day)
        ? prev.repeatDays.filter((d) => d !== day)
        : [...prev.repeatDays, day],
    }))
  }

  const selectAllDays = () => {
    setForm((prev) => ({ ...prev, repeatDays: [...DAY_ORDER] }))
  }

  const selectWeekdays = () => {
    setForm((prev) => ({ ...prev, repeatDays: [1, 2, 3, 4, 5] }))
  }

  const selectWeekend = () => {
    setForm((prev) => ({ ...prev, repeatDays: [6, 0] }))
  }

  const clearDays = () => {
    setForm((prev) => ({ ...prev, repeatDays: [] }))
  }

  const canSave = !!form.poolId && !saving

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      {/* Obsidian-Card mit Puls-Frame; Header/Footer fix, nur der Body scrollt
          (kein sticky — .kbk-obsidian > * erzwingt position:relative) */}
      <div
        className="kbk-obsidian framed rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rasta-green/15 flex items-center justify-center">
              <Clock className="text-rasta-green" size={16} />
            </div>
            <div>
              <h2 className="font-bold text-foreground">
                {editing ? 'Edit Slot' : 'Quick Create Slot'}
              </h2>
              <p className="text-xs text-muted">
                {editing ? 'Update this timetable entry' : 'Drop a pool into the weekly schedule'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted hover:text-foreground rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — einzige Scroll-Fläche des Modals */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Pool-Auswahl */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
              <Layers size={13} className="text-rasta-green" />
              Pool *
            </label>
            <select
              value={form.poolId}
              onChange={(e) => setForm({ ...form, poolId: e.target.value })}
              className={cn(adminSelectClass, 'w-full')}
            >
              <option value="">Select pool...</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.trackCount} track{p.trackCount === 1 ? '' : 's'}
                  {p.genre ? ` (${p.genre})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Tage — Multi-Select mit Presets */}
          {!editing && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <CalendarCheck size={13} className="text-rasta-green" />
                  Days *
                </label>
                <div className="flex gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={selectAllDays}
                    className="px-2 py-0.5 rounded bg-elevated hover:bg-elevated/70 text-secondary cursor-pointer transition-colors"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={selectWeekdays}
                    className="px-2 py-0.5 rounded bg-elevated hover:bg-elevated/70 text-secondary cursor-pointer transition-colors"
                  >
                    Weekdays
                  </button>
                  <button
                    type="button"
                    onClick={selectWeekend}
                    className="px-2 py-0.5 rounded bg-elevated hover:bg-elevated/70 text-secondary cursor-pointer transition-colors"
                  >
                    Weekend
                  </button>
                  <button
                    type="button"
                    onClick={clearDays}
                    className="px-2 py-0.5 rounded bg-elevated hover:bg-elevated/70 text-secondary cursor-pointer transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_ORDER.map((d) => {
                  const active = form.repeatDays.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleRepeatDay(d)}
                      className={cn(
                        'py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer border',
                        active
                          ? 'bg-rasta-green/20 border-rasta-green/40 text-rasta-green'
                          : 'bg-elevated border-border text-muted hover:text-foreground hover:border-border/80'
                      )}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted mt-1.5">
                {form.repeatDays.length === 0
                  ? 'Pick one or more days — slot is created once per selected day.'
                  : form.repeatDays.length === 1
                    ? '1 day selected.'
                    : `${form.repeatDays.length} days selected — creates ${form.repeatDays.length} slots.`}
              </p>
            </div>
          )}

          {/* Editing: einzelner Tag */}
          {editing && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Day</label>
              <select
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
                className={cn(adminSelectClass, 'w-full')}
              >
                {DAY_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Start/End-Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Start</label>
              <div className="flex gap-1.5 items-center">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={form.startHour}
                  onChange={(e) =>
                    setForm({ ...form, startHour: Math.max(0, Math.min(23, Number(e.target.value))) })
                  }
                  className={cn(adminInputClass, 'w-full px-2 text-center')}
                />
                <span className="text-muted">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  step={15}
                  value={form.startMin}
                  onChange={(e) =>
                    setForm({ ...form, startMin: Math.max(0, Math.min(59, Number(e.target.value))) })
                  }
                  className={cn(adminInputClass, 'w-full px-2 text-center')}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">End</label>
              <div className="flex gap-1.5 items-center">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={form.endHour}
                  onChange={(e) =>
                    setForm({ ...form, endHour: Math.max(0, Math.min(23, Number(e.target.value))) })
                  }
                  className={cn(adminInputClass, 'w-full px-2 text-center')}
                />
                <span className="text-muted">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  step={15}
                  value={form.endMin}
                  onChange={(e) =>
                    setForm({ ...form, endMin: Math.max(0, Math.min(59, Number(e.target.value))) })
                  }
                  className={cn(adminInputClass, 'w-full px-2 text-center')}
                />
              </div>
            </div>
          </div>

          {/* Label + Priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
                placeholder="Phonk Sessions"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Priority</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className={cn(adminInputClass, 'w-full')}
                placeholder="0"
              />
              <p className="text-[11px] text-muted mt-1">Higher priority wins on overlap</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-4 border-t border-border shrink-0">
          {editing && onDelete ? (
            <AdminButton variant="danger" size="sm" onClick={onDelete}>
              <Trash2 size={14} />
              Delete
            </AdminButton>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <AdminButton variant="ghost" onClick={onClose}>
              Cancel
            </AdminButton>
            <AdminButton
              variant="primary"
              onClick={() => onSave(form)}
              isLoading={saving}
              disabled={
                !canSave ||
                (!editing && form.repeatDays.length === 0)
              }
            >
              {editing
                ? 'Update Slot'
                : form.repeatDays.length > 1
                  ? `Create ${form.repeatDays.length} Slots`
                  : 'Create Slot'}
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  )
}
