'use client'

/**
 * TimetableGrid — Visuelles 7x24-Raster für den Radio-Wochenplan
 *
 * - Kompakte Slot-Cards mit Pool-Farb-Code, 2-line Info (Time + Pool-Name)
 * - Hover zeigt Details (Label + Pool)
 * - Gaps werden rot-gepunktet markiert (statt leer)
 * - Click auf leere Zelle öffnet Quick-Create
 * - Click auf Slot öffnet Edit
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { DAY_LABELS } from '@/lib/constants'

export interface GridSlot {
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

export interface GridGap {
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
  severity: 'warning' | 'critical'
}

interface TimetableGridProps {
  slots: GridSlot[]
  gaps: GridGap[]
  poolColorMap: Map<string, string>
  onCellClick: (day: number, hour: number) => void
  onSlotClick: (slot: GridSlot) => void
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface LaidOutSlot {
  slot: GridSlot
  /** Spalten-Index innerhalb der Überlappungs-Gruppe (0-basiert) */
  lane: number
  /** Spalten-Anzahl der Überlappungs-Gruppe */
  laneCount: number
}

/**
 * Lane-Layout für parallele Slots (Kalender-Prinzip): Slots, die sich
 * zeitlich überlappen (z. B. Phonk- und Hardtek-Channel laufen 24/7
 * parallel), teilen sich die Zellen-Breite, statt übereinander gerendert
 * zu werden — vorher war der Text beider Karten ein unlesbarer Matsch.
 */
function layoutDaySlots(daySlots: GridSlot[]): LaidOutSlot[] {
  const items = daySlots
    .map((slot) => {
      const start = slot.startHour * 60 + slot.startMin
      let end = slot.endHour * 60 + slot.endMin
      if (end <= start) end += 24 * 60
      return { slot, start, end, lane: 0, laneCount: 1 }
    })
    .sort((a, b) => a.start - b.start || a.end - b.end)

  // Greedy-Zuweisung in die erste freie Lane; transitiv überlappende Slots
  // bilden eine Gruppe, deren max. Lane-Zahl die gemeinsame Breite bestimmt.
  const laneEnds: number[] = []
  let groupStart = 0
  let groupMaxEnd = -1

  const finalizeGroup = (endIdx: number) => {
    let lanesUsed = 0
    for (let i = groupStart; i < endIdx; i++) {
      lanesUsed = Math.max(lanesUsed, items[i].lane + 1)
    }
    for (let i = groupStart; i < endIdx; i++) {
      items[i].laneCount = lanesUsed
    }
  }

  items.forEach((item, idx) => {
    if (idx > 0 && item.start >= groupMaxEnd) {
      finalizeGroup(idx)
      groupStart = idx
      laneEnds.length = 0
    }
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    item.lane = lane
    groupMaxEnd = Math.max(groupMaxEnd, item.end)
  })
  if (items.length > 0) finalizeGroup(items.length)

  return items
}

export default function TimetableGrid({
  slots,
  gaps,
  poolColorMap,
  onCellClick,
  onSlotClick,
}: TimetableGridProps) {
  // Slot-Höhe in Stunden (für absolute Positionierung).
  // Minuten-genaue Normalisierung wie in layoutDaySlots — der alte
  // Stunden-Vergleich machte Slots innerhalb derselben Stunde (10:00–10:45)
  // fälschlich ~24h hoch.
  const getSlotHeight = (slot: GridSlot) => {
    const start = slot.startHour * 60 + slot.startMin
    let end = slot.endHour * 60 + slot.endMin
    if (end <= start) end += 24 * 60
    return Math.max(0.25, (end - start) / 60)
  }

  // Gaps nach Tag gruppieren (für Overlay-Rendering)
  const gapsByDay = useMemo(() => {
    const map = new Map<number, GridGap[]>()
    for (const gap of gaps) {
      if (!map.has(gap.dayOfWeek)) map.set(gap.dayOfWeek, [])
      map.get(gap.dayOfWeek)!.push(gap)
    }
    return map
  }, [gaps])

  // Slots nach Tag gruppieren
  const slotsByDay = useMemo(() => {
    const map = new Map<number, GridSlot[]>()
    for (const slot of slots) {
      if (!map.has(slot.dayOfWeek)) map.set(slot.dayOfWeek, [])
      map.get(slot.dayOfWeek)!.push(slot)
    }
    return map
  }, [slots])

  return (
    <div className="kbk-obsidian rounded-xl overflow-hidden">
      {/* Mobile-Liste (< md): pro Tag eine vertikale Liste der Slots */}
      <div className="md:hidden divide-y divide-border">
        {DAY_ORDER.map((day) => {
          const daySlots = (slotsByDay.get(day) || []).sort(
            (a, b) => a.startHour * 60 + a.startMin - (b.startHour * 60 + b.startMin)
          )
          const dayGaps = gapsByDay.get(day) || []
          const hasCriticalGap = dayGaps.some((g) => g.severity === 'critical')
          const pad = (n: number) => String(n).padStart(2, '0')
          return (
            <div key={`m-${day}`} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {DAY_LABELS[day]}
                </h3>
                <div className="flex items-center gap-2">
                  {hasCriticalGap && (
                    <span className="text-[10px] font-semibold text-red-400 uppercase">
                      Has gap
                    </span>
                  )}
                  <button
                    onClick={() => onCellClick(day, 20)}
                    className="text-[10px] font-semibold text-rasta-green hover:text-rasta-green-light"
                  >
                    + Add
                  </button>
                </div>
              </div>
              {daySlots.length === 0 ? (
                <p className="text-xs text-muted italic py-2">No slots scheduled.</p>
              ) : (
                <div className="space-y-1.5">
                  {daySlots.map((slot) => {
                    const color =
                      poolColorMap.get(slot.pool.id) ||
                      'bg-rasta-green/15 border-rasta-green/30 text-rasta-green'
                    return (
                      <button
                        key={slot.id}
                        onClick={() => onSlotClick(slot)}
                        className={cn(
                          'w-full text-left rounded-lg border px-3 py-2 flex items-center justify-between gap-2',
                          'hover:ring-1 hover:ring-rasta-green/40 transition-all',
                          color
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-mono opacity-75">
                            {pad(slot.startHour)}:{pad(slot.startMin)} –{' '}
                            {pad(slot.endHour)}:{pad(slot.endMin)}
                          </div>
                          <div className="text-sm font-semibold truncate">
                            {slot.label || slot.pool.name}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Desktop-Grid (>= md) */}
      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[760px]">
          {/* Tage-Header */}
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-border">
            <div className="p-2" />
            {DAY_ORDER.map((day) => (
              <div
                key={day}
                className="p-2 text-center text-xs font-semibold text-muted uppercase tracking-wider"
              >
                {DAY_LABELS[day]}
              </div>
            ))}
          </div>

          {/* Grid-Body mit absoluter Positionierung für Slots + Gaps */}
          <div className="grid grid-cols-[3rem_repeat(7,1fr)]">
            {/* Stunden-Labels (linke Spalte) */}
            <div className="flex flex-col">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-10 flex items-start justify-end pr-2 text-[10px] text-muted font-mono pt-0.5 border-b border-border/30"
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Tages-Spalten */}
            {DAY_ORDER.map((day) => {
              const daySlots = slotsByDay.get(day) || []
              const dayGaps = gapsByDay.get(day) || []

              return (
                <div
                  key={day}
                  className="relative border-l border-border/30"
                  style={{ height: `${24 * 2.5}rem` }}
                >
                  {/* Stunden-Linien + klickbare Zellen (Hintergrund) */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute inset-x-0 h-10 border-b border-border/20 hover:bg-elevated/30 cursor-pointer transition-colors"
                      style={{ top: `${hour * 2.5}rem` }}
                      onClick={() => onCellClick(day, hour)}
                    />
                  ))}

                  {/* Gap-Overlays (rot-gepunktet) */}
                  {dayGaps.map((gap, i) => {
                    const topRem = (gap.startMinutes / 60) * 2.5
                    const heightRem = ((gap.endMinutes - gap.startMinutes) / 60) * 2.5
                    const critical = gap.severity === 'critical'
                    return (
                      <div
                        key={`gap-${day}-${i}`}
                        className={cn(
                          'absolute inset-x-0.5 rounded pointer-events-none z-0',
                          critical
                            ? 'bg-red-500/10 border-2 border-dashed border-red-500/60'
                            : 'bg-amber-500/10 border-2 border-dashed border-amber-500/50'
                        )}
                        style={{
                          top: `${topRem}rem`,
                          height: `${Math.max(0.5, heightRem)}rem`,
                        }}
                        title={`Gap — ${critical ? 'CRITICAL (within 24h)' : 'warning'}`}
                      />
                    )
                  })}

                  {/* Slots (absolute Positionierung; parallele Slots teilen sich die Breite) */}
                  {layoutDaySlots(daySlots).map(({ slot, lane, laneCount }) => {
                    const topRem = (slot.startHour + slot.startMin / 60) * 2.5
                    const heightRem = getSlotHeight(slot) * 2.5
                    const color = poolColorMap.get(slot.pool.id) || 'bg-rasta-green/15 border-rasta-green/30 text-rasta-green'
                    const pad = (n: number) => String(n).padStart(2, '0')
                    return (
                      <button
                        key={slot.id}
                        className={cn(
                          'absolute rounded-lg border text-left z-10 cursor-pointer',
                          'px-2 py-1 flex flex-col justify-start overflow-hidden',
                          'hover:ring-2 hover:ring-offset-1 hover:ring-offset-surface hover:ring-rasta-green/40 hover:z-20',
                          'transition-all',
                          color
                        )}
                        style={{
                          top: `${topRem + 0.1}rem`,
                          height: `${Math.max(1.8, heightRem - 0.2)}rem`,
                          left: `calc(${(lane / laneCount) * 100}% + 3px)`,
                          width: `calc(${100 / laneCount}% - 6px)`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSlotClick(slot)
                        }}
                        title={`${slot.label || slot.pool.name}\n${slot.pool.name}\n${pad(slot.startHour)}:${pad(slot.startMin)} – ${pad(slot.endHour)}:${pad(slot.endMin)}${slot.priority ? `\nPriority: ${slot.priority}` : ''}`}
                      >
                        <span className="text-[10px] font-mono opacity-75 leading-tight">
                          {pad(slot.startHour)}:{pad(slot.startMin)}–{pad(slot.endHour)}:{pad(slot.endMin)}
                        </span>
                        <span className="text-[11px] font-semibold leading-tight truncate">
                          {slot.label || slot.pool.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Legende */}
          <div className="flex items-center gap-4 p-3 border-t border-border text-[11px] text-muted flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-rasta-green/20 border border-rasta-green/40" />
              Scheduled slot
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border-2 border-dashed border-amber-500/60 bg-amber-500/10" />
              Gap (warning)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border-2 border-dashed border-red-500/60 bg-red-500/10" />
              Gap (critical, &lt;24h)
            </span>
            <span className="ml-auto">Click empty cell to create · click slot to edit</span>
          </div>
        </div>
      </div>
    </div>
  )
}
