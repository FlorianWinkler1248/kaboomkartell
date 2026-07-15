'use client'

/**
 * Admin Radio — Timetable-Editor mit visuellem Wochenraster
 *
 * Polish-Upgrade:
 * - Kompakte Slot-Cards mit Pool-Farb-Code (2 Zeilen: Zeit + Pool-Name)
 * - Gaps rot-gepunktet in der Timetable-Visualisierung (statt nur Banner)
 * - Quick-Create-Modal mit Multi-Day-Toggle (Mo-So) und Presets
 * - Obsidian-Look via Admin-UI-Primitives (AdminPageHeader/AdminCard/AdminButton)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  Loader2,
  X,
  AlertTriangle,
  AlertCircle,
  Calendar,
  Clock,
  Zap,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DAY_LABELS, EVENT_TYPE_LABELS } from '@/lib/constants'
import { useToast } from '@/components/providers/ToastProvider'
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
  adminSelectClass,
} from '@/components/admin/ui'
import TimetableGrid, {
  type GridSlot,
  type GridGap,
} from '@/components/admin/radio/TimetableGrid'
import SlotQuickCreateModal, {
  type SlotFormState,
} from '@/components/admin/radio/SlotQuickCreateModal'

interface SlotData {
  id: string
  dayOfWeek: number
  startHour: number
  startMin: number
  endHour: number
  endMin: number
  label: string | null
  priority: number
  pool: { id: string; name: string; genre: string | null }
}

interface EventData {
  id: string
  title: string
  description: string | null
  startTime: string
  endTime: string
  eventType: string
  poolId: string | null
  streamUrl: string | null
  pool: { id: string; name: string } | null
}

interface PoolOption {
  id: string
  name: string
  genre: string | null
  trackCount: number
}

// Pool-Farben (konsistent mit UpcomingTimetable.tsx ENTRY_COLORS + Pools-Seite)
const POOL_COLORS = [
  'bg-rasta-green/20 border-rasta-green/40 text-rasta-green',
  'bg-blue-500/20 border-blue-500/40 text-blue-400',
  'bg-purple-500/20 border-purple-500/40 text-purple-400',
  'bg-amber-500/20 border-amber-500/40 text-amber-400',
  'bg-pink-500/20 border-pink-500/40 text-pink-400',
  'bg-cyan-500/20 border-cyan-500/40 text-cyan-400',
  'bg-rasta-red/20 border-rasta-red/40 text-rasta-red',
]

const DEFAULT_SLOT_FORM: SlotFormState = {
  dayOfWeek: 1,
  startHour: 0,
  startMin: 0,
  endHour: 6,
  endMin: 0,
  label: '',
  poolId: '',
  priority: 0,
  repeatDays: [],
}

export default function AdminRadioPage() {
  const { toast } = useToast()
  const [slots, setSlots] = useState<SlotData[]>([])
  const [events, setEvents] = useState<EventData[]>([])
  const [pools, setPools] = useState<PoolOption[]>([])
  const [gaps, setGaps] = useState<GridGap[]>([])
  const [loading, setLoading] = useState(true)

  // Slot-Modal
  const [showSlotForm, setShowSlotForm] = useState(false)
  const [editingSlot, setEditingSlot] = useState<SlotData | null>(null)
  const [slotFormInitial, setSlotFormInitial] = useState<SlotFormState>(DEFAULT_SLOT_FORM)
  const [savingSlot, setSavingSlot] = useState(false)

  // Event-Dialog
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    eventType: 'POOL',
    poolId: '',
    streamUrl: '',
    // v2.31: Subgenre-Override (raggatek im Hardtek-Channel etc.). Leer = kein Override.
    subgenre: '',
  })
  const [savingEvent, setSavingEvent] = useState(false)

  // Pool-Farben-Map
  const poolColorMap = useMemo(() => {
    const map = new Map<string, string>()
    pools.forEach((pool, i) => {
      map.set(pool.id, POOL_COLORS[i % POOL_COLORS.length])
    })
    return map
  }, [pools])

  const loadData = useCallback(async () => {
    try {
      const [timetableRes, poolsRes, gapsRes] = await Promise.all([
        fetch('/api/admin/timetable'),
        fetch('/api/admin/pools'),
        fetch('/api/admin/timetable/gaps'),
      ])
      const [timetableJson, poolsJson, gapsJson] = await Promise.all([
        timetableRes.json(),
        poolsRes.json(),
        gapsRes.json(),
      ])

      if (timetableJson.success) {
        setSlots(timetableJson.data.slots)
        setEvents(timetableJson.data.events)
      }
      if (poolsJson.success) setPools(poolsJson.data)
      if (gapsJson.success) setGaps(gapsJson.data.gaps)

      // Fehl-Responses nicht verschlucken — ein Sammel-Toast reicht
      const failed = [timetableJson, poolsJson, gapsJson].find((j) => !j.success)
      if (failed) {
        toast({
          message: failed.error || 'Failed to load radio data.',
          type: 'error',
        })
      }
    } catch (e) {
      console.error('Radio-Daten laden Fehler:', e)
      toast({ message: 'Failed to load radio data.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Grid-Slot-Datentyp
  const gridSlots: GridSlot[] = useMemo(
    () =>
      slots.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startHour: s.startHour,
        startMin: s.startMin,
        endHour: s.endHour,
        endMin: s.endMin,
        label: s.label,
        priority: s.priority,
        pool: s.pool,
      })),
    [slots]
  )

  // Quick-Create-Modal öffnen (leer oder mit vorbelegter Zeit)
  const openCreateModal = (day?: number, hour?: number) => {
    setEditingSlot(null)
    const start = hour ?? 0
    // End-Stunde auf 0-23 clampen, damit die Backend-Validierung nicht schiesst
    const end = Math.min(23, start + 2)
    setSlotFormInitial({
      dayOfWeek: day ?? 1,
      startHour: start,
      startMin: 0,
      endHour: end,
      endMin: 0,
      label: '',
      poolId: pools[0]?.id || '',
      priority: 0,
      // Wenn von einer Zelle gestartet: nur dieser Tag; sonst leer (Multi-Select im Modal)
      repeatDays: day !== undefined ? [day] : [],
    })
    setShowSlotForm(true)
  }

  // Edit-Modal öffnen
  const openEditModal = (slot: GridSlot) => {
    setEditingSlot(slot as SlotData)
    setSlotFormInitial({
      dayOfWeek: slot.dayOfWeek,
      startHour: slot.startHour,
      startMin: slot.startMin,
      endHour: slot.endHour,
      endMin: slot.endMin,
      label: slot.label || '',
      poolId: slot.pool.id,
      priority: slot.priority,
      repeatDays: [],
    })
    setShowSlotForm(true)
  }

  // Slot speichern
  const handleSaveSlot = async (form: SlotFormState) => {
    if (!form.poolId) return
    setSavingSlot(true)
    try {
      if (editingSlot) {
        // Update
        const res = await fetch(`/api/admin/timetable/${editingSlot.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dayOfWeek: form.dayOfWeek,
            startHour: form.startHour,
            startMin: form.startMin,
            endHour: form.endHour,
            endMin: form.endMin,
            label: form.label,
            poolId: form.poolId,
            priority: form.priority,
          }),
        })
        const json = await res.json()
        if (json.success) {
          toast({ message: 'Slot updated!', type: 'success' })
          setShowSlotForm(false)
          setEditingSlot(null)
          loadData()
        } else {
          toast({ message: json.error || 'Error updating slot.', type: 'error' })
        }
      } else {
        // Create — repeatDays wird im Backend abgearbeitet, dayOfWeek ist Fallback
        const days = form.repeatDays.length > 0 ? form.repeatDays : [form.dayOfWeek]
        const res = await fetch('/api/admin/timetable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dayOfWeek: days[0],
            startHour: form.startHour,
            startMin: form.startMin,
            endHour: form.endHour,
            endMin: form.endMin,
            label: form.label || undefined,
            poolId: form.poolId,
            priority: form.priority,
            repeatDays: days,
          }),
        })
        const json = await res.json()
        if (json.success) {
          const count = Array.isArray(json.data) ? json.data.length : 1
          toast({
            message: `${count} slot${count === 1 ? '' : 's'} created!`,
            type: 'success',
          })
          setShowSlotForm(false)
          loadData()
        } else {
          toast({ message: json.error || 'Error creating slot.', type: 'error' })
        }
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setSavingSlot(false)
    }
  }

  // Slot löschen
  const handleDeleteSlot = async () => {
    if (!editingSlot) return
    if (!confirm(`Delete slot "${editingSlot.label || editingSlot.pool.name}"?`)) return
    try {
      const res = await fetch(`/api/admin/timetable/${editingSlot.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (json.success) {
        toast({ message: 'Slot deleted.', type: 'success' })
        setShowSlotForm(false)
        setEditingSlot(null)
        loadData()
      } else {
        toast({ message: json.error || 'Error deleting slot.', type: 'error' })
      }
    } catch {
      toast({ message: 'Error deleting slot.', type: 'error' })
    }
  }

  // Event erstellen
  const handleCreateEvent = async () => {
    if (!eventForm.title || !eventForm.startTime || !eventForm.endTime) return
    setSavingEvent(true)
    try {
      const res = await fetch('/api/admin/timetable/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventForm),
      })
      const json = await res.json()
      if (json.success) {
        toast({ message: 'Event created!', type: 'success' })
        setShowEventForm(false)
        setEventForm({
          title: '',
          description: '',
          startTime: '',
          endTime: '',
          eventType: 'POOL',
          poolId: '',
          streamUrl: '',
          subgenre: '',
        })
        loadData()
      } else {
        toast({ message: json.error || 'Error creating event.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setSavingEvent(false)
    }
  }

  // Event löschen
  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Delete this event?')) return
    try {
      const res = await fetch(`/api/admin/timetable/events/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        toast({ message: 'Event deleted.', type: 'success' })
        loadData()
      } else {
        toast({ message: json.error || 'Error deleting event.', type: 'error' })
      }
    } catch {
      toast({ message: 'Error deleting event.', type: 'error' })
    }
  }

  // Kritische Lücken-Anzahl
  const criticalGaps = gaps.filter((g) => g.severity === 'critical').length

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
        kickerTag="/R/"
        kicker="ON AIR CONTROL"
        title="RADIO TIMETABLE"
        actions={
          <>
            <AdminButton
              variant="accent"
              size="sm"
              onClick={() => setShowEventForm(!showEventForm)}
            >
              <Zap size={14} />
              New Event
            </AdminButton>
            <AdminButton variant="primary" size="sm" onClick={() => openCreateModal()}>
              <Plus size={14} />
              New Slot
            </AdminButton>
          </>
        }
      />

      {/* Lücken-Warnung */}
      {gaps.length > 0 && (
        <AdminCard
          framed
          frame={criticalGaps > 0 ? 'red' : 'yellow'}
          padding="sm"
          className={cn(
            'flex items-start gap-3',
            criticalGaps > 0 ? 'text-rasta-red-light' : 'text-rasta-yellow'
          )}
        >
          {criticalGaps > 0 ? (
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-medium">
              {criticalGaps > 0
                ? `${criticalGaps} critical gap(s) within 24 hours!`
                : `${gaps.length} gap(s) in the weekly schedule`}
            </p>
            <p className="text-sm opacity-80 mt-1">
              {gaps
                .slice(0, 3)
                .map((g) => {
                  const startH = Math.floor(g.startMinutes / 60)
                  const startM = g.startMinutes % 60
                  const endH = Math.floor(g.endMinutes / 60)
                  const endM = g.endMinutes % 60
                  return `${DAY_LABELS[g.dayOfWeek]} ${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}–${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
                })
                .join(', ')}
              {gaps.length > 3 ? ` (+${gaps.length - 3} more)` : ''}
            </p>
            <p className="text-xs opacity-70 mt-1">
              Gaps are highlighted in red-dotted overlays on the timetable below.
            </p>
          </div>
        </AdminCard>
      )}

      {/* Visuelles Wochenraster */}
      <TimetableGrid
        slots={gridSlots}
        gaps={gaps}
        poolColorMap={poolColorMap}
        onCellClick={(day, hour) => openCreateModal(day, hour)}
        onSlotClick={(slot) => openEditModal(slot)}
      />

      {/* Slot-Quick-Create-Modal */}
      <SlotQuickCreateModal
        open={showSlotForm}
        editing={!!editingSlot}
        initial={slotFormInitial}
        pools={pools}
        saving={savingSlot}
        onClose={() => {
          setShowSlotForm(false)
          setEditingSlot(null)
        }}
        onSave={handleSaveSlot}
        onDelete={editingSlot ? handleDeleteSlot : undefined}
      />

      {/* Event-Formular (inline, wie bisher) */}
      {showEventForm && (
        <AdminCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Zap size={16} className="text-rasta-yellow" />
              Create Event
            </h3>
            <button
              onClick={() => setShowEventForm(false)}
              className="text-muted hover:text-foreground cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Title *</label>
              <input
                type="text"
                value={eventForm.title}
                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
                placeholder="4Flow Live-Stream"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Type *</label>
              <select
                value={eventForm.eventType}
                onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })}
                className={cn(adminSelectClass, 'w-full')}
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Start *</label>
              <input
                type="datetime-local"
                value={eventForm.startTime}
                onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">End *</label>
              <input
                type="datetime-local"
                value={eventForm.endTime}
                onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
              />
            </div>

            {eventForm.eventType === 'POOL' && (
              <div>
                <label className="block text-sm text-muted mb-1">Pool</label>
                <select
                  value={eventForm.poolId}
                  onChange={(e) => setEventForm({ ...eventForm, poolId: e.target.value })}
                  className={cn(adminSelectClass, 'w-full')}
                >
                  <option value="">Select pool...</option>
                  {pools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(eventForm.eventType === 'YOUTUBE' || eventForm.eventType === 'TWITCH') && (
              <div>
                <label className="block text-sm text-muted mb-1">Stream URL *</label>
                <input
                  type="url"
                  value={eventForm.streamUrl}
                  onChange={(e) => setEventForm({ ...eventForm, streamUrl: e.target.value })}
                  className={cn(adminInputClass, 'w-full')}
                  placeholder={
                    eventForm.eventType === 'TWITCH'
                      ? 'https://www.twitch.tv/kbk4flow'
                      : 'https://youtube.com/watch?v=...'
                  }
                />
                {eventForm.eventType === 'TWITCH' && (
                  <p className="text-xs text-muted mt-1">
                    Tip: must be{' '}
                    <code className="font-mono">https://www.twitch.tv/&lt;channel&gt;</code> — the
                    player parses the channel login from the URL.
                  </p>
                )}
              </div>
            )}

            {/* v2.31: Subgenre-Override für Live-Events. Erlaubt z.B. ein
                Raggatek-Set im Hardtek-Channel — Akzent + Equalizer schalten
                automatisch auf Raggatek-Grün statt Hardtek-Gelb. */}
            <div>
              <label className="block text-sm text-muted mb-1">
                Subgenre Override (channel accent)
              </label>
              <select
                value={eventForm.subgenre}
                onChange={(e) => setEventForm({ ...eventForm, subgenre: e.target.value })}
                className={cn(adminSelectClass, 'w-full')}
              >
                <option value="">— no override (channel default)</option>
                <option value="raggatek">raggatek (green accent instead of hardtek yellow)</option>
                <option value="brazilian-phonk">brazilian-phonk (green accent instead of phonk red)</option>
              </select>
              <p className="text-xs text-muted mt-1">
                Optional. Switches the channel tab and equalizer accent color while this
                event is active.
              </p>
            </div>
          </div>

          <AdminButton
            variant="accent"
            onClick={handleCreateEvent}
            isLoading={savingEvent}
            disabled={
              savingEvent || !eventForm.title || !eventForm.startTime || !eventForm.endTime
            }
          >
            Create Event
          </AdminButton>
        </AdminCard>
      )}

      {/* Kommende Events */}
      {events.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Calendar size={16} />
            Upcoming Events
          </h3>
          <div className="space-y-2">
            {events.map((event) => (
              <AdminCard
                key={event.id}
                padding="none"
                className="flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      event.eventType !== 'POOL' ? 'bg-rasta-red/20' : 'bg-rasta-yellow/15'
                    )}
                  >
                    {event.eventType !== 'POOL' ? (
                      <Zap size={14} className="text-rasta-red-light" />
                    ) : (
                      <Clock size={14} className="text-rasta-yellow" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground text-sm">{event.title}</span>
                      {event.eventType !== 'POOL' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rasta-red/20 text-rasta-red-light">
                          LIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {new Date(event.startTime).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      {new Date(event.startTime).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      –{' '}
                      {new Date(event.endTime).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {event.pool && ` · ${event.pool.name}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteEvent(event.id)}
                  className="p-2 text-muted hover:text-rasta-red-light rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </AdminCard>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
