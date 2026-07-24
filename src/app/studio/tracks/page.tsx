'use client'

/**
 * Studio — My Tracks (ADR-041 Welle 3)
 *
 * Tabelle aller eigenen Tracks (Missions-Page-Muster, overflow-x-auto):
 * Titel + Cover-Thumb, Genre, Status-Badge (DRAFT/PENDING/CHANGES_REQUESTED/
 * APPROVED/REJECTED + LIVE wenn isPublic), reviewNote-Aufklapper, echte
 * Plays/Aura-Zahlen. Edit-Modal (PUT-Teilmenge) nur bei PENDING/
 * CHANGES_REQUESTED — Re-Submit nach CHANGES_REQUESTED ist derselbe PUT
 * (Server setzt den Status zurück auf PENDING).
 *
 * Sprite-Button pro Zeile (nur editierbare Tracks): POST .../sprite →
 * Cover-Thumb aktualisieren. 429 = Rate-Limit (5/h) als Toast, 503 =
 * Cover-Service nicht konfiguriert → alle Sprite-Buttons disabled.
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Pencil, X, Sparkles, ChevronDown, ChevronUp, Music2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GENRES } from '@/lib/constants'
import { useToast } from '@/components/providers/ToastProvider'
import { SafeImg } from '@/components/ui/SafeImg'
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
  adminSelectClass,
} from '@/components/admin/ui'
import {
  type StudioTrack,
  trackDisplayStatus,
  SUBMISSION_STATUS_COLORS,
  isTrackEditable,
} from '@/components/studio/studio-types'

interface EditFormState {
  title: string
  genre: string
  bpm: string
  description: string
  isrc: string
  label: string
  message: string
  coverUrl: string
}

export default function StudioTracksPage() {
  const { toast } = useToast()
  const [tracks, setTracks] = useState<StudioTrack[]>([])
  const [loading, setLoading] = useState(true)
  // reviewNote-Aufklapper (CHANGES_REQUESTED / REJECTED)
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  // Edit-Modal
  const [editingTrack, setEditingTrack] = useState<StudioTrack | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [saving, setSaving] = useState(false)
  // Sprite-Generierung: Track-Id des laufenden Requests + globaler 503-Fallback
  const [spriteBusyId, setSpriteBusyId] = useState<string | null>(null)
  const [spriteUnavailable, setSpriteUnavailable] = useState(false)

  const loadTracks = useCallback(async () => {
    try {
      const res = await fetch('/api/studio/tracks')
      const json = await res.json()
      if (json.success) {
        setTracks(json.data.tracks)
      } else {
        toast({ message: json.error || 'Error loading tracks.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadTracks()
  }, [loadTracks])

  const openEdit = (track: StudioTrack) => {
    setEditingTrack(track)
    // description + message liefert das GET nicht — leere Felder werden beim
    // Speichern NICHT gesendet (Teilmengen-PUT), Bestand bleibt erhalten.
    setEditForm({
      title: track.title,
      genre: track.genre,
      bpm: track.bpm !== null ? String(track.bpm) : '',
      description: '',
      isrc: track.isrc ?? '',
      label: track.label ?? '',
      message: '',
      coverUrl: track.coverUrl ?? '',
    })
  }

  const closeEdit = () => {
    setEditingTrack(null)
    setEditForm(null)
  }

  const handleSaveEdit = async () => {
    if (!editingTrack || !editForm) return
    if (!editForm.title.trim()) {
      toast({ message: 'Title is required.', type: 'error' })
      return
    }
    setSaving(true)
    try {
      const bpmNumber = editForm.bpm.trim() === '' ? null : Number(editForm.bpm)
      // Teilmengen-PUT: leere optionale Text-Felder (description/message)
      // weglassen statt sie mit '' zu überschreiben.
      const payload: Record<string, unknown> = {
        title: editForm.title.trim(),
        genre: editForm.genre,
        bpm: Number.isFinite(bpmNumber as number) ? bpmNumber : null,
        isrc: editForm.isrc.trim() || null,
        label: editForm.label.trim() || null,
      }
      if (editForm.description.trim()) payload.description = editForm.description
      if (editForm.message.trim()) payload.message = editForm.message
      if (editForm.coverUrl.trim()) payload.coverUrl = editForm.coverUrl.trim()

      const wasChangesRequested = editingTrack.submission?.status === 'CHANGES_REQUESTED'
      const res = await fetch(`/api/studio/tracks/${editingTrack.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.success) {
        toast({
          message: wasChangesRequested
            ? 'Changes saved — track re-submitted for review.'
            : 'Track updated.',
          type: 'success',
        })
        closeEdit()
        loadTracks()
      } else {
        toast({ message: json.error || 'Error saving track.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // Sprite generieren/regenerieren — max 5/h (Server-Rate-Limit 429)
  const handleGenerateSprite = async (track: StudioTrack) => {
    setSpriteBusyId(track.id)
    try {
      const res = await fetch(`/api/studio/tracks/${track.id}/sprite`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (res.status === 429) {
        toast({ message: 'Sprite rate limit reached (5 per hour) — try again later.', type: 'error' })
        return
      }
      if (res.status === 503) {
        // Cover-Service nicht konfiguriert → Buttons dauerhaft disabled
        setSpriteUnavailable(true)
        toast({ message: 'Sprite generation is currently unavailable.', type: 'error' })
        return
      }
      if (json?.success) {
        const coverUrl: string = json.data.coverUrl
        setTracks((prev) =>
          prev.map((t) => (t.id === track.id ? { ...t, coverUrl } : t))
        )
        toast({ message: 'Sprite cover generated.', type: 'success' })
      } else {
        toast({ message: json?.error || 'Error generating sprite.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setSpriteBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        kickerTag="/S/"
        kicker="ARTIST STUDIO"
        title="MY TRACKS"
        description="Your submissions and their review status. Editing is open while a track is pending or changes are requested."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-muted" size={32} />
        </div>
      ) : tracks.length === 0 ? (
        <AdminCard className="text-center py-10 text-muted text-sm">
          No tracks yet — submit your first one via Upload.
        </AdminCard>
      ) : (
        <AdminCard padding="none" className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-muted font-mono text-[10px] tracking-wider uppercase border-b border-border">
                <th className="px-4 py-3">Track</th>
                <th className="px-4 py-3">Genre</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Plays</th>
                <th className="px-4 py-3 text-right">Aura</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => {
                const status = trackDisplayStatus(track)
                const editable = isTrackEditable(track)
                const note = track.submission?.reviewNote
                const noteExpanded = expandedNoteId === track.id
                return (
                  <tr key={track.id} className="border-b border-border/50 align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* Cover-Thumb = Sprite-Preview */}
                        <div className="w-10 h-10 shrink-0 rounded overflow-hidden bg-kbk-dark-800 border border-border">
                          <SafeImg
                            src={track.coverUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            fallback={
                              <div className="w-full h-full flex items-center justify-center">
                                <Music2 size={16} className="text-muted" />
                              </div>
                            }
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate max-w-[220px]">
                            {track.title}
                          </div>
                          <div className="text-xs text-muted font-mono">
                            {track.isrc || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-secondary">{track.genre}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={cn(
                            'inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase',
                            SUBMISSION_STATUS_COLORS[status] || 'bg-white/10 text-muted'
                          )}
                        >
                          {status.replace('_', ' ')}
                        </span>
                        {track.isPublic && (
                          <span className="inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase bg-rasta-green/15 text-rasta-green">
                            Live
                          </span>
                        )}
                      </div>
                      {/* reviewNote-Aufklapper — Flows Feedback sichtbar machen */}
                      {note && (
                        <div className="mt-1.5">
                          <button
                            onClick={() => setExpandedNoteId(noteExpanded ? null : track.id)}
                            className="inline-flex items-center gap-1 text-xs text-orange-400 hover:underline cursor-pointer"
                          >
                            Review note
                            {noteExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                          {noteExpanded && (
                            <p className="mt-1 text-xs text-secondary whitespace-pre-wrap break-words max-w-[280px]">
                              {note}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    {/* ECHTE Zahlen — keine Vanity-Fakes */}
                    <td className="px-4 py-3 text-right font-mono text-xs text-secondary">
                      {track.playCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-secondary">
                      {track.auraCount}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {editable && (
                          <>
                            <button
                              onClick={() => handleGenerateSprite(track)}
                              disabled={spriteUnavailable || spriteBusyId !== null}
                              className={cn(
                                'p-1.5 rounded-lg transition-colors',
                                spriteUnavailable || spriteBusyId !== null
                                  ? 'text-muted/40 cursor-not-allowed'
                                  : 'text-muted hover:text-rasta-green hover:bg-elevated cursor-pointer'
                              )}
                              aria-label={`Generate sprite cover for ${track.title}`}
                              title={
                                spriteUnavailable
                                  ? 'Sprite generation unavailable'
                                  : track.coverUrl
                                    ? 'Regenerate sprite cover (max 5/h)'
                                    : 'Generate sprite cover (max 5/h)'
                              }
                            >
                              {spriteBusyId === track.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Sparkles size={14} />
                              )}
                            </button>
                            <button
                              onClick={() => openEdit(track)}
                              className="p-1.5 text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors cursor-pointer"
                              aria-label={`Edit track ${track.title}`}
                            >
                              <Pencil size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </AdminCard>
      )}

      {/* Edit-Modal — nur bei PENDING/CHANGES_REQUESTED erreichbar */}
      {editingTrack && editForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Edit track ${editingTrack.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={closeEdit}
        >
          <AdminCard
            framed
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Edit Track</h3>
              <button
                onClick={closeEdit}
                className="p-1.5 text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors cursor-pointer"
                aria-label="Close edit dialog"
              >
                <X size={16} />
              </button>
            </div>
            {editingTrack.submission?.status === 'CHANGES_REQUESTED' && (
              <p className="text-xs text-orange-400">
                Saving will re-submit this track for review.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm text-muted mb-1">Title *</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className={cn(adminInputClass, 'w-full')}
                  maxLength={120}
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Genre</label>
                <select
                  value={editForm.genre}
                  onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                  className={cn(adminSelectClass, 'w-full')}
                >
                  {GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">BPM</label>
                <input
                  type="number"
                  value={editForm.bpm}
                  onChange={(e) => setEditForm({ ...editForm, bpm: e.target.value })}
                  className={cn(adminInputClass, 'w-full')}
                  placeholder="140"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">
                  ISRC <span className="opacity-60">(CCXXXYYNNNNN)</span>
                </label>
                <input
                  type="text"
                  value={editForm.isrc}
                  onChange={(e) => setEditForm({ ...editForm, isrc: e.target.value })}
                  className={cn(adminInputClass, 'w-full font-mono')}
                  placeholder="DEABC2600001"
                  maxLength={15}
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Label</label>
                <input
                  type="text"
                  value={editForm.label}
                  onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                  className={cn(adminInputClass, 'w-full')}
                  placeholder="Label name"
                  maxLength={120}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-muted mb-1">
                  Description <span className="opacity-60">(leave empty to keep current)</span>
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className={cn(adminInputClass, 'w-full min-h-[70px]')}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-muted mb-1">
                  Message to Flow <span className="opacity-60">(leave empty to keep current)</span>
                </label>
                <textarea
                  value={editForm.message}
                  onChange={(e) => setEditForm({ ...editForm, message: e.target.value })}
                  className={cn(adminInputClass, 'w-full min-h-[70px]')}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <AdminButton onClick={handleSaveEdit} isLoading={saving}>
                {editingTrack.submission?.status === 'CHANGES_REQUESTED'
                  ? 'Save & Re-submit'
                  : 'Save Changes'}
              </AdminButton>
              <AdminButton variant="ghost" onClick={closeEdit}>
                Cancel
              </AdminButton>
            </div>
          </AdminCard>
        </div>
      )}
    </div>
  )
}
