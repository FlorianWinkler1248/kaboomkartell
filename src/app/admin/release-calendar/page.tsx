'use client';

/**
 * Release Calendar — Admin-Seite
 *
 * Wochen- und Monatsansicht für Release-Slots.
 * - Slots erstellen, bearbeiten, löschen
 * - Boomy-Slots (KI-generiert) mit violetter Markierung
 * - Status-Verwaltung: OPEN → RESERVED → UPLOADED → APPROVED → PUBLISHED / EXPIRED
 * - Assignee-Zuweisung (Künstler / Helfer)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Bot,
  Music2,
  X,
  Loader2,
  Clock,
  Check,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
  adminSelectClass,
} from '@/components/admin/ui';
import { useToast } from '@/components/providers/ToastProvider';

// === Typen ===

interface ApiSlot {
  id: string;
  scheduledDate: string;
  status: SlotStatus;
  isBoomy: boolean;
  notes: string | null;
  assigneeId: string | null;
  trackId: string | null;
  assignee: { id: string; username: string; displayName: string | null } | null;
  track: { id: string; title: string; slug: string; status: string; genre: string | null; artistId: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface ReleaseSlot {
  id: string;
  date: string;
  time: string;
  isBoomySlot: boolean;
  assigneeId: string | null;
  assignee: { id: string; username: string; displayName: string | null } | null;
  trackId: string | null;
  trackTitle: string | null;
  status: SlotStatus;
  notes: string | null;
}

interface UserData {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
}

type SlotStatus = 'OPEN' | 'RESERVED' | 'UPLOADED' | 'APPROVED' | 'PUBLISHED' | 'EXPIRED';
type ViewMode = 'week' | 'month';

interface SlotFormData {
  date: string;
  time: string;
  isBoomySlot: boolean;
  assigneeId: string;
  notes: string;
  status: SlotStatus;
}

// === Hilfsfunktionen ===

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDE(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Erster Tag des Monats */
function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Alle Tage für die Monatsansicht (inkl. Padding-Tage der Vor-/Nachwoche) */
function getMonthGridDays(monthStart: Date): Date[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Montag der Woche, in der der 1. liegt
  const gridStart = getMonday(firstDay);
  // Sonntag der Woche, in der der letzte Tag liegt
  const gridEnd = new Date(lastDay);
  const endDow = gridEnd.getDay();
  if (endDow !== 0) gridEnd.setDate(gridEnd.getDate() + (7 - endDow));

  const days: Date[] = [];
  const current = new Date(gridStart);
  while (current <= gridEnd) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function mapApiSlot(api: ApiSlot): ReleaseSlot {
  const d = new Date(api.scheduledDate);
  return {
    id: api.id,
    date: toISODate(d),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    isBoomySlot: api.isBoomy,
    assigneeId: api.assigneeId,
    assignee: api.assignee,
    trackId: api.trackId,
    trackTitle: api.track?.title || null,
    status: api.status,
    notes: api.notes,
  };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Status-Farben auf KBK-Semantik: gelb = in Arbeit, grün = freigegeben/live,
// muted = inaktiv (OPEN) bzw. abgelaufen (EXPIRED, durchgestrichen).
const STATUS_STYLES: Record<SlotStatus, string> = {
  OPEN: 'text-muted bg-muted/10 border-muted/30',
  RESERVED: 'text-rasta-yellow bg-rasta-yellow/10 border-rasta-yellow/25',
  UPLOADED: 'text-rasta-yellow-light bg-rasta-yellow-light/10 border-rasta-yellow-light/25',
  APPROVED: 'text-rasta-green bg-rasta-green/10 border-rasta-green/25',
  PUBLISHED: 'text-rasta-green bg-rasta-green/25 border-rasta-green/50',
  EXPIRED: 'text-muted/60 bg-muted/5 border-border line-through',
};

const ALL_STATUSES: SlotStatus[] = ['OPEN', 'RESERVED', 'UPLOADED', 'APPROVED', 'PUBLISHED', 'EXPIRED'];

// === Hauptkomponente ===

export default function ReleaseCalendarPage() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [mobileDayIndex, setMobileDayIndex] = useState<number>(() => {
    // Aktueller Wochentag als Index (Mo=0, So=6)
    const dow = new Date().getDay();
    return dow === 0 ? 6 : dow - 1;
  });
  const [currentMonth, setCurrentMonth] = useState<Date>(() => getMonthStart(new Date()));
  const [slots, setSlots] = useState<ReleaseSlot[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ReleaseSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<SlotFormData>({
    date: '', time: '12:00', isBoomySlot: false, assigneeId: '', notes: '', status: 'OPEN',
  });

  const todayISO = toISODate(new Date());

  // Wochen-Tage
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      return d;
    }), [currentWeekStart]);

  // Monats-Grid
  const monthGridDays = useMemo(() => getMonthGridDays(currentMonth), [currentMonth]);

  // Datumsbereich für API-Abfrage
  const dateRange = useMemo(() => {
    if (viewMode === 'week') {
      const from = toISODate(currentWeekStart);
      const sun = new Date(currentWeekStart);
      sun.setDate(sun.getDate() + 6);
      return { from, to: toISODate(sun) };
    }
    return {
      from: toISODate(monthGridDays[0]),
      to: toISODate(monthGridDays[monthGridDays.length - 1]),
    };
  }, [viewMode, currentWeekStart, monthGridDays]);

  // === Daten laden ===

  const loadSlots = useCallback(async () => {
    try {
      const res = await fetch(`/api/release-slots?from=${dateRange.from}&to=${dateRange.to}`);
      const json = await res.json();
      if (json.success) {
        setSlots((json.data || []).map(mapApiSlot));
      } else {
        setError(json.error || 'Failed to load slots');
      }
    } catch {
      setError('Failed to load release slots');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      const json = await res.json();
      if (json.success && json.data) setUsers(json.data);
    } catch { /* Nicht kritisch */ }
  }, []);

  useEffect(() => { setLoading(true); setError(''); loadSlots(); }, [loadSlots]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  // === Navigation ===

  const goToPrev = () => {
    if (viewMode === 'week') {
      setCurrentWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
    } else {
      setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    }
  };

  const goToNext = () => {
    if (viewMode === 'week') {
      setCurrentWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });
    } else {
      setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    }
  };

  const goToToday = () => {
    setCurrentWeekStart(getMonday(new Date()));
    setCurrentMonth(getMonthStart(new Date()));
  };

  // === Slots für einen Tag ===
  const getSlotsForDay = (date: Date): ReleaseSlot[] => {
    const iso = toISODate(date);
    return slots.filter(s => s.date === iso);
  };

  // === Zuweisbare User ===
  const assignableUsers = users.filter(u => u.role === 'KUENSTLER' || u.role === 'HELFER' || u.role === 'ADMIN');

  // === Modal ===
  const openCreateModal = (date: Date) => {
    setEditingSlot(null);
    setFormData({ date: toISODate(date), time: '12:00', isBoomySlot: false, assigneeId: '', notes: '', status: 'OPEN' });
    setShowModal(true);
  };

  const openEditModal = (slot: ReleaseSlot) => {
    setEditingSlot(slot);
    setFormData({
      date: slot.date, time: slot.time || '12:00', isBoomySlot: slot.isBoomySlot,
      assigneeId: slot.assigneeId || '', notes: slot.notes || '', status: slot.status,
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingSlot(null); setSaving(false); };

  // === CRUD ===

  // Fehler laufen als Toast — der Inline-Banner liegt hinter dem Modal und
  // wäre bei offenem Dialog unsichtbar (Audit-Befund: stille Fehler).
  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/release-slots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledDate: `${formData.date}T${formData.time}:00`,
          isBoomy: formData.isBoomySlot,
          ...((!formData.isBoomySlot && formData.assigneeId) ? { assigneeId: formData.assigneeId } : {}),
          ...(formData.notes ? { notes: formData.notes } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: 'Release slot created.' });
        closeModal(); loadSlots();
      } else toast({ type: 'error', message: json.error || 'Failed to create slot' });
    } catch { toast({ type: 'error', message: 'Failed to create slot' }); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editingSlot) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/release-slots/${editingSlot.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledDate: `${formData.date}T${formData.time}:00`,
          isBoomy: formData.isBoomySlot,
          ...((!formData.isBoomySlot && formData.assigneeId) ? { assigneeId: formData.assigneeId } : { assigneeId: null }),
          ...(formData.notes ? { notes: formData.notes } : { notes: null }),
          status: formData.status,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: 'Release slot updated.' });
        closeModal(); loadSlots();
      } else toast({ type: 'error', message: json.error || 'Failed to update slot' });
    } catch { toast({ type: 'error', message: 'Failed to update slot' }); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!editingSlot || !confirm('Delete this release slot?')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/release-slots/${editingSlot.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: 'Release slot deleted.' });
        closeModal(); loadSlots();
      } else toast({ type: 'error', message: json.error || 'Failed to delete slot' });
    } catch { toast({ type: 'error', message: 'Failed to delete slot' }); }
    finally { setSaving(false); }
  };

  const handleApprove = async () => {
    if (!editingSlot) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/release-slots/${editingSlot.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ type: 'success', message: 'Slot approved for release.' });
        closeModal(); loadSlots();
      } else toast({ type: 'error', message: json.error || 'Failed to approve slot' });
    } catch { toast({ type: 'error', message: 'Failed to approve slot' }); }
    finally { setSaving(false); }
  };

  const handleSave = () => editingSlot ? handleUpdate() : handleCreate();

  // === Titel-String ===
  const headerTitle = viewMode === 'week'
    ? `${formatDE(weekDays[0])} — ${formatDE(weekDays[6])} ${weekDays[6].getFullYear()}`
    : `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  // === Slot-Pill: schmaler Indikator im Kalender, Details per Hover-Popover ===
  const SlotPill = ({ slot, compact = false }: { slot: ReleaseSlot; compact?: boolean }) => {
    const name = slot.isBoomySlot
      ? 'Boomy'
      : (slot.assignee?.displayName || slot.assignee?.username || 'Unassigned');

    return (
      <div className="relative group/slot">
        {/* Schmaler Pill/Bar im Kalender */}
        <button
          onClick={() => openEditModal(slot)}
          className={cn(
            'w-full text-left rounded-md transition-all cursor-pointer flex items-center gap-1.5 overflow-hidden',
            compact ? 'py-0.5 px-1.5' : 'py-1 px-2',
            slot.isBoomySlot
              ? 'bg-violet-500/15 hover:bg-violet-500/25 border-l-[3px] border-l-violet-500'
              : 'bg-elevated/50 hover:bg-elevated border-l-[3px]',
            !slot.isBoomySlot && slot.status === 'OPEN' && 'border-l-muted/60',
            !slot.isBoomySlot && slot.status === 'RESERVED' && 'border-l-rasta-yellow',
            !slot.isBoomySlot && slot.status === 'UPLOADED' && 'border-l-rasta-yellow-light',
            !slot.isBoomySlot && slot.status === 'APPROVED' && 'border-l-rasta-green/60',
            !slot.isBoomySlot && slot.status === 'PUBLISHED' && 'border-l-rasta-green',
            !slot.isBoomySlot && slot.status === 'EXPIRED' && 'border-l-muted/30',
          )}
        >
          {slot.isBoomySlot && <Bot size={compact ? 10 : 12} className="text-violet-400 shrink-0" />}
          <span className={cn(
            'truncate font-medium',
            compact ? 'text-[10px]' : 'text-xs',
            slot.isBoomySlot ? 'text-violet-300' : 'text-foreground/80',
            slot.status === 'EXPIRED' && 'line-through opacity-60'
          )}>
            {name}
          </span>
          {!compact && slot.time && (
            <span className="ml-auto text-[10px] text-muted shrink-0">{slot.time}</span>
          )}
        </button>

        {/* Hover-Popover mit allen Details */}
        <div className={cn(
          'absolute z-40 invisible group-hover/slot:visible opacity-0 group-hover/slot:opacity-100',
          'transition-all duration-150 pointer-events-none group-hover/slot:pointer-events-auto',
          'top-full left-0 mt-1 w-64',
        )}>
          <div className="bg-kbk-dark-800 border border-border rounded-xl p-3 shadow-2xl shadow-black/40">
            {/* Popover-Header */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                {slot.isBoomySlot && <Bot size={14} className="text-violet-400" />}
                <span className={cn('font-semibold text-sm', slot.isBoomySlot ? 'text-violet-300' : 'text-foreground')}>
                  {name}
                </span>
              </div>
              <span className={cn('px-1.5 py-0.5 text-[10px] font-semibold rounded border uppercase', STATUS_STYLES[slot.status])}>
                {slot.status}
              </span>
            </div>

            {/* Details */}
            <div className="space-y-1.5 text-xs">
              {/* Uhrzeit */}
              <div className="flex items-center gap-1.5 text-muted">
                <Clock size={11} className="shrink-0" />
                <span>Release at {slot.time}</span>
              </div>

              {/* Track */}
              {slot.trackTitle ? (
                <div className="flex items-center gap-1.5 text-foreground/80">
                  <Music2 size={11} className="shrink-0 text-rasta-green" />
                  <span className="truncate">{slot.trackTitle}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-muted/60 italic">
                  <Music2 size={11} className="shrink-0" />
                  <span>Awaiting upload</span>
                </div>
              )}

              {/* Notizen */}
              {slot.notes && (
                <p className="text-muted/70 pt-1 border-t border-border/50 mt-1">
                  {slot.notes}
                </p>
              )}
            </div>

            {/* Hinweis */}
            <p className="text-[10px] text-muted/40 mt-2 pt-1.5 border-t border-border/50">
              Click to edit
            </p>
          </div>
        </div>
      </div>
    );
  };

  // === Add-Button für Tag ===
  const AddButton = ({ day, compact = false }: { day: Date; compact?: boolean }) => (
    <button
      onClick={() => openCreateModal(day)}
      className={cn(
        'w-full flex items-center justify-center rounded-md transition-all cursor-pointer',
        'text-muted/30 hover:text-rasta-green hover:bg-rasta-green/5',
        'border border-dashed border-transparent hover:border-rasta-green/30',
        compact ? 'py-0.5 mt-0.5' : 'py-1.5 mt-auto'
      )}
    >
      <Plus size={compact ? 12 : 14} />
    </button>
  );

  return (
    <div className="max-w-full">
      {/* Header */}
      <AdminPageHeader
        kickerTag="/RC/"
        kicker="DROP SCHEDULE"
        title="RELEASE CALENDAR"
        description="Schedule and manage release slots for crew and Boomy"
        actions={
          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border bg-kbk-dark-800/60">
            <AdminButton
              size="sm"
              variant={viewMode === 'week' ? 'secondary' : 'ghost'}
              onClick={() => setViewMode('week')}
            >
              Week
            </AdminButton>
            <AdminButton
              size="sm"
              variant={viewMode === 'month' ? 'secondary' : 'ghost'}
              onClick={() => setViewMode('month')}
            >
              Month
            </AdminButton>
          </div>
        }
      />

      {/* Fehler (nur Lade-Fehler — Mutations-Fehler laufen als Toast) */}
      {error && (
        <AdminCard
          framed
          frame="red"
          padding="sm"
          className="mb-4 flex items-center gap-3 text-sm text-rasta-red-light"
        >
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="cursor-pointer"><X size={14} /></button>
        </AdminCard>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <AdminButton size="sm" variant="ghost" onClick={goToPrev} aria-label="Previous">
            <ChevronLeft size={18} />
          </AdminButton>
          <AdminButton size="sm" variant="secondary" onClick={goToToday}>
            Today
          </AdminButton>
          <AdminButton size="sm" variant="ghost" onClick={goToNext} aria-label="Next">
            <ChevronRight size={18} />
          </AdminButton>
        </div>
        <h2 className="font-heading font-semibold text-lg tabular-nums">{headerTitle}</h2>
      </div>

      {/* === Kalender === */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-rasta-green" size={28} />
        </div>
      ) : viewMode === 'week' ? (
        /* ==================== WOCHENANSICHT ==================== */
        <>
          {/* Desktop: 7-Spalten Grid */}
          <AdminCard padding="none" className="hidden md:block overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border">
              {weekDays.map((day, i) => {
                const isToday = toISODate(day) === todayISO;
                return (
                  <div key={i} className={cn(
                    'text-center py-3 border-r border-border last:border-r-0',
                    isToday && 'bg-rasta-green/5'
                  )}>
                    <p className={cn('text-xs font-semibold uppercase tracking-wider', isToday ? 'text-rasta-green' : 'text-muted')}>
                      {DAY_HEADERS[i]}
                    </p>
                    <p className={cn('text-xl font-bold tabular-nums mt-0.5', isToday ? 'text-rasta-green' : 'text-foreground')}>
                      {day.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-7 min-h-[280px]">
              {weekDays.map((day, i) => {
                const isToday = toISODate(day) === todayISO;
                const daySlots = getSlotsForDay(day);
                return (
                  <div key={i} className={cn(
                    'border-r border-border last:border-r-0 p-2 flex flex-col gap-1.5',
                    isToday && 'bg-rasta-green/5'
                  )}>
                    {daySlots.map(slot => <SlotPill key={slot.id} slot={slot} />)}
                    <AddButton day={day} />
                  </div>
                );
              })}
            </div>
          </AdminCard>

          {/* Mobile: Single-Day-View mit Tages-Tabs */}
          <div className="md:hidden">
            {/* Tages-Tabs (horizontale Leiste) */}
            <AdminCard padding="none" className="flex items-center gap-1 mb-3 p-1">
              {weekDays.map((day, i) => {
                const isToday = toISODate(day) === todayISO;
                const isSelected = mobileDayIndex === i;
                const hasSlots = getSlotsForDay(day).length > 0;
                return (
                  <button
                    key={i}
                    onClick={() => setMobileDayIndex(i)}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-center transition-colors cursor-pointer relative',
                      isSelected
                        ? 'bg-rasta-green/20 text-rasta-green'
                        : isToday
                          ? 'text-rasta-green/60'
                          : 'text-muted hover:text-foreground hover:bg-elevated/50'
                    )}
                  >
                    <p className="text-[10px] font-semibold uppercase">{DAY_HEADERS[i].charAt(0)}</p>
                    <p className="text-sm font-bold tabular-nums">{day.getDate()}</p>
                    {/* Slot-Indikator Punkt */}
                    {hasSlots && (
                      <span className={cn(
                        'absolute top-1 right-1 w-1.5 h-1.5 rounded-full',
                        isSelected ? 'bg-rasta-green' : 'bg-muted/40'
                      )} />
                    )}
                  </button>
                );
              })}
            </AdminCard>

            {/* Ausgewählter Tag — Detail */}
            {(() => {
              const day = weekDays[mobileDayIndex];
              const isToday = toISODate(day) === todayISO;
              const daySlots = getSlotsForDay(day);
              return (
                <AdminCard padding="none" className={cn(
                  'p-4',
                  isToday && 'border border-rasta-green/40'
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-sm font-semibold uppercase tracking-wider',
                        isToday ? 'text-rasta-green' : 'text-muted'
                      )}>
                        {DAY_HEADERS[mobileDayIndex]}
                      </span>
                      <span className={cn(
                        'text-xl font-bold tabular-nums',
                        isToday ? 'text-rasta-green' : 'text-foreground'
                      )}>
                        {day.getDate()}.{String(day.getMonth() + 1).padStart(2, '0')}
                      </span>
                      {isToday && <span className="text-xs text-rasta-green/60 font-medium">Today</span>}
                    </div>
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      onClick={() => openCreateModal(day)}
                    >
                      <Plus size={12} />
                      Add
                    </AdminButton>
                  </div>
                  {daySlots.length > 0 ? (
                    <div className="space-y-2">
                      {daySlots.map(slot => <SlotPill key={slot.id} slot={slot} />)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted/40 italic py-4 text-center">No release slots</p>
                  )}
                </AdminCard>
              );
            })()}
          </div>
        </>
      ) : (
        /* ==================== MONATSANSICHT ==================== */
        <>
          {/* Desktop: 7-Spalten Monatsgrid */}
          <AdminCard padding="none" className="hidden md:block overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border">
              {DAY_HEADERS.map(name => (
                <div key={name} className="text-center py-2 text-xs font-semibold uppercase tracking-wider text-muted border-r border-border last:border-r-0">
                  {name}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthGridDays.map((day, i) => {
                const iso = toISODate(day);
                const isToday = iso === todayISO;
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                const daySlots = getSlotsForDay(day);
                const isWeekEnd = i % 7 < 6;

                return (
                  <div
                    key={iso}
                    className={cn(
                      'min-h-[100px] p-1.5 border-b border-border flex flex-col',
                      isWeekEnd && 'border-r',
                      !isCurrentMonth && 'bg-kbk-dark-800/30',
                      isToday && 'bg-rasta-green/5'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full',
                        isToday ? 'bg-rasta-green text-white' : isCurrentMonth ? 'text-foreground/80' : 'text-muted/40'
                      )}>
                        {day.getDate()}
                      </span>
                      {isCurrentMonth && (
                        <button
                          onClick={() => openCreateModal(day)}
                          className="p-0.5 text-muted/30 hover:text-rasta-green transition-all cursor-pointer"
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 space-y-0.5">
                      {daySlots.map(slot => <SlotPill key={slot.id} slot={slot} compact />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </AdminCard>

          {/* Mobile: Nur Tage mit Slots anzeigen (kompakte Liste) */}
          <div className="md:hidden space-y-2">
            {(() => {
              // Nur Tage des aktuellen Monats mit Slots zeigen
              const daysWithSlots = monthGridDays.filter(day =>
                day.getMonth() === currentMonth.getMonth() && getSlotsForDay(day).length > 0
              );
              if (daysWithSlots.length === 0) {
                return (
                  <AdminCard padding="none" className="p-6 text-center">
                    <p className="text-muted text-sm">No release slots this month</p>
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      onClick={() => openCreateModal(new Date())}
                      className="mt-3"
                    >
                      <Plus size={14} />
                      Create first slot
                    </AdminButton>
                  </AdminCard>
                );
              }
              return daysWithSlots.map(day => {
                const isToday = toISODate(day) === todayISO;
                const daySlots = getSlotsForDay(day);
                const dayIdx = (day.getDay() + 6) % 7; // Montag = 0
                return (
                  <AdminCard key={toISODate(day)} padding="none" className={cn(
                    'p-3',
                    isToday && 'border border-rasta-green/40'
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-xs font-semibold uppercase tracking-wider',
                          isToday ? 'text-rasta-green' : 'text-muted'
                        )}>
                          {DAY_HEADERS[dayIdx]}
                        </span>
                        <span className={cn(
                          'text-lg font-bold tabular-nums',
                          isToday ? 'text-rasta-green' : 'text-foreground'
                        )}>
                          {day.getDate()}.{String(day.getMonth() + 1).padStart(2, '0')}
                        </span>
                      </div>
                      <button
                        onClick={() => openCreateModal(day)}
                        className="p-1.5 text-muted hover:text-rasta-green rounded-lg hover:bg-rasta-green/10 transition-colors cursor-pointer"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {daySlots.map(slot => <SlotPill key={slot.id} slot={slot} />)}
                    </div>
                  </AdminCard>
                );
              });
            })()}
          </div>
        </>
      )}

      {/* Legende */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wider">Status:</span>
        {ALL_STATUSES.map(s => (
          <span key={s} className={cn('px-2 py-0.5 rounded border', STATUS_STYLES[s])}>{s}</span>
        ))}
        <span className="ml-2 flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm border-l-[3px] border-l-violet-500 bg-violet-500/10" />
          Boomy (AI)
        </span>
      </div>

      {/* === Create/Edit Modal === */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <AdminCard padding="none" className="w-full max-w-lg p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-heading font-bold text-xl">
                {editingSlot ? 'Edit Release Slot' : 'Create Release Slot'}
              </h3>
              <button onClick={closeModal} className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Datum + Zeit nebeneinander */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Date</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className={cn(adminInputClass, 'w-full py-2.5')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Time</label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="time"
                      value={formData.time}
                      onChange={e => setFormData(prev => ({ ...prev, time: e.target.value }))}
                      className={cn(adminInputClass, 'w-full py-2.5 pl-9')}
                    />
                  </div>
                </div>
              </div>

              {/* Boomy Toggle */}
              <label className="flex items-center gap-3 p-3 rounded-lg bg-elevated/50 border border-border cursor-pointer hover:bg-elevated transition-colors">
                <input
                  type="checkbox"
                  checked={formData.isBoomySlot}
                  onChange={e => setFormData(prev => ({ ...prev, isBoomySlot: e.target.checked }))}
                  className="w-4 h-4 rounded accent-violet-500"
                />
                <Bot size={16} className="text-violet-400" />
                <div>
                  <span className="text-sm font-medium">Boomy Slot</span>
                  <p className="text-xs text-muted">AI-generated track from the pool</p>
                </div>
              </label>

              {/* Assignee */}
              {!formData.isBoomySlot && (
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Assignee</label>
                  <select
                    value={formData.assigneeId}
                    onChange={e => setFormData(prev => ({ ...prev, assigneeId: e.target.value }))}
                    className={cn(adminSelectClass, 'w-full py-2.5')}
                  >
                    <option value="">— No assignee —</option>
                    {assignableUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.displayName || u.username} ({u.role})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status (nur Edit) */}
              {editingSlot && (
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as SlotStatus }))}
                    className={cn(adminSelectClass, 'w-full py-2.5')}
                  >
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* Verknüpfter Track + Approve */}
              {editingSlot?.trackTitle && (
                <div className="p-3 rounded-lg bg-elevated/50 border border-border">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Linked Track</p>
                  <p className="text-sm flex items-center gap-1.5">
                    <Music2 size={14} className="text-rasta-green" />
                    {editingSlot.trackTitle}
                  </p>
                  {editingSlot.status === 'UPLOADED' && (
                    <AdminButton
                      size="sm"
                      onClick={handleApprove}
                      isLoading={saving}
                      className="mt-2"
                    >
                      {!saving && <Check size={12} />}
                      Approve for Release
                    </AdminButton>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional notes..."
                  rows={2}
                  className={cn(adminInputClass, 'w-full py-2.5 resize-none')}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <div>
                {editingSlot && (editingSlot.status === 'OPEN' || editingSlot.status === 'RESERVED') && (
                  <AdminButton
                    variant="ghost"
                    onClick={handleDelete}
                    disabled={saving}
                    className="text-rasta-red hover:text-rasta-red hover:bg-rasta-red/10"
                  >
                    <Trash2 size={14} />
                    Delete
                  </AdminButton>
                )}
              </div>
              <div className="flex items-center gap-2">
                <AdminButton variant="ghost" onClick={closeModal}>
                  Cancel
                </AdminButton>
                <AdminButton
                  onClick={handleSave}
                  isLoading={saving}
                  disabled={!formData.date}
                >
                  {!saving && <Check size={16} />}
                  {editingSlot ? 'Save Changes' : 'Create Slot'}
                </AdminButton>
              </div>
            </div>
          </AdminCard>
        </div>
      )}
    </div>
  );
}
