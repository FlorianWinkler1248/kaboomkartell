'use client'

/**
 * Admin Submissions — Review-Queue der Studio-Einreichungen (ADR-041 Welle 3)
 *
 * Status-Tabs (PENDING default) über EINER Tabelle. Die Liste wird komplett
 * geladen und client-seitig gefiltert — so stimmen die Count-Badges aller
 * Tabs ohne N Requests (Review-Queue bleibt klein).
 *
 * Pro Zeile aufklappbar: HTML5-Audio-Vorhören (preload="none", Stream-Route),
 * volle Artist-Message, reviewNote, ISRC/Label. Review-Aktionen folgen der
 * Übergangs-Matrix aus lib/submission.ts:
 *   - PENDING:            Approve & Publish / Approve only / Request changes / Reject
 *   - CHANGES_REQUESTED:  Approve & Publish / Approve only / Reject
 *     (REQUEST_CHANGES erneut wäre serverseitig 409 — Button gar nicht anbieten)
 * APPROVE + publish:true veröffentlicht den Track und hängt ihn in den Genre-Pool.
 *
 * Muster: src/app/admin/missions/page.tsx (Envelope, Toast, confirm bei Destruktivem).
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, ChevronDown, ChevronUp, Music2, ExternalLink } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import { AI_DISCLOSURE_SHORT } from '@/lib/constants'
import { useToast } from '@/components/providers/ToastProvider'
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
} from '@/components/admin/ui'

// === Status-Konstanten (String-Enum-Konvention, Spiegel von lib/submission.ts) ===

const SUBMISSION_STATUSES = ['PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'] as const
type SubmissionStatusFilter = (typeof SUBMISSION_STATUSES)[number] | 'ALL'

const STATUS_TABS: SubmissionStatusFilter[] = [...SUBMISSION_STATUSES, 'ALL']

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400',
  CHANGES_REQUESTED: 'bg-orange-500/15 text-orange-400',
  APPROVED: 'bg-rasta-green/15 text-rasta-green',
  REJECTED: 'bg-rasta-red/15 text-rasta-red',
}

// Tab-Beschriftung (Admin ist EN-only, kompakt statt SCREAMING_SNAKE)
const STATUS_LABELS: Record<SubmissionStatusFilter, string> = {
  PENDING: 'Pending',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ALL: 'All',
}

// === API-Shapes (GET /api/admin/submissions) ===

interface SubmissionTrack {
  id: string
  title: string
  slug: string
  genre: string | null
  bpm: number | null
  duration: number
  coverUrl: string | null
  aiDisclosure: string | null
  isrc: string | null
  label: string | null
  isPublic: boolean
  filePath: string | null
  artistProfile: { id: string; slug: string; name: string } | null
}

interface AdminSubmission {
  id: string
  status: string
  message: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  track: SubmissionTrack
  submitter: { id: string; username: string; email: string }
}

type ReviewAction = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'

// Note-Panel-Zustand: für welche Submission ist welche Notiz-Aktion offen?
interface NotePanelState {
  submissionId: string
  action: 'REQUEST_CHANGES' | 'REJECT'
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={cn(
        'inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase whitespace-nowrap',
        STATUS_COLORS[value] || 'bg-white/10 text-muted'
      )}
    >
      {value.replace('_', ' ')}
    </span>
  )
}

export default function AdminSubmissionsPage() {
  const { toast } = useToast()

  const [submissions, setSubmissions] = useState<AdminSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<SubmissionStatusFilter>('PENDING')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Note-Panel (Request changes / Reject mit Begründung)
  const [notePanel, setNotePanel] = useState<NotePanelState | null>(null)
  const [noteText, setNoteText] = useState('')
  const [acting, setActing] = useState(false)

  // === Loader — immer ALLE laden, Tabs filtern client-seitig ===

  const loadSubmissions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/submissions')
      const json = await res.json()
      if (json.success) {
        setSubmissions(json.data)
      } else {
        toast({ message: json.error || 'Error loading submissions.', type: 'error' })
      }
    } catch {
      toast({ message: 'Error loading submissions.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadSubmissions()
  }, [loadSubmissions])

  // === Review-Aktion (POST /api/admin/submissions/[id]) ===

  const submitReview = async (
    s: AdminSubmission,
    action: ReviewAction,
    opts: { publish?: boolean; note?: string } = {}
  ) => {
    setActing(true)
    try {
      const res = await fetch(`/api/admin/submissions/${s.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(opts.publish !== undefined ? { publish: opts.publish } : {}),
          ...(opts.note?.trim() ? { note: opts.note.trim() } : {}),
        }),
      })
      const json = await res.json()
      if (json.success) {
        const messages: Record<ReviewAction, string> = {
          APPROVE: opts.publish
            ? 'Approved and published — track is live in the pool.'
            : 'Approved (not published yet).',
          REQUEST_CHANGES: 'Changes requested — the artist can re-submit.',
          REJECT: 'Submission rejected.',
        }
        toast({ message: messages[action], type: 'success' })
        setNotePanel(null)
        setNoteText('')
        loadSubmissions()
      } else {
        // 409 = Übergang laut Matrix nicht erlaubt — Server-Text durchreichen
        toast({ message: json.error || 'Error reviewing submission.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setActing(false)
    }
  }

  const handleApprovePublish = (s: AdminSubmission) => {
    if (
      !confirm(
        `Approve and PUBLISH "${s.track.title}"? The track goes live and joins its genre pool.`
      )
    )
      return
    submitReview(s, 'APPROVE', { publish: true })
  }

  const handleApproveOnly = (s: AdminSubmission) => {
    submitReview(s, 'APPROVE', { publish: false })
  }

  // Note-Panel öffnen — Zeile mit aufklappen, damit die Textarea sichtbar ist
  const openNotePanel = (s: AdminSubmission, action: 'REQUEST_CHANGES' | 'REJECT') => {
    setNotePanel({ submissionId: s.id, action })
    setNoteText('')
    setExpandedId(s.id)
  }

  const handleNoteSubmit = (s: AdminSubmission) => {
    if (!notePanel) return
    if (notePanel.action === 'REQUEST_CHANGES') {
      // Pflicht-Notiz: ohne Feedback weiß der Artist nicht, WAS er ändern soll
      if (!noteText.trim()) {
        toast({ message: 'A note is required — tell the artist what to change.', type: 'error' })
        return
      }
      submitReview(s, 'REQUEST_CHANGES', { note: noteText })
    } else {
      if (!confirm(`Reject "${s.track.title}"? This is final for this submission.`)) return
      submitReview(s, 'REJECT', { note: noteText })
    }
  }

  // === Render ===

  const filtered = tab === 'ALL' ? submissions : submissions.filter((s) => s.status === tab)
  const countFor = (t: SubmissionStatusFilter) =>
    t === 'ALL' ? submissions.length : submissions.filter((s) => s.status === t).length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        kickerTag="/S/"
        kicker="ARTIST ECOSYSTEM"
        title="SUBMISSIONS"
        description="Review queue of studio uploads — listen, then approve, request changes or reject."
      />

      {/* Status-Tabs mit Count-Badges */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg border transition-all cursor-pointer',
              tab === t
                ? 'text-rasta-green bg-rasta-green/10 border-rasta-green/30 text-glow-green'
                : 'text-secondary border-transparent hover:text-foreground hover:bg-elevated'
            )}
          >
            {STATUS_LABELS[t]}{' '}
            <span className="opacity-60 font-mono text-xs">({countFor(t)})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-muted" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <AdminCard className="text-center py-10 text-muted text-sm">
          {tab === 'ALL'
            ? 'No submissions yet — the studio inbox is empty.'
            : `No submissions with status ${STATUS_LABELS[tab]}.`}
        </AdminCard>
      ) : (
        <AdminCard padding="none" className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-muted font-mono text-[10px] tracking-wider uppercase border-b border-border">
                <th className="px-4 py-3">Track</th>
                <th className="px-4 py-3">Meta</th>
                <th className="px-4 py-3">Submitter</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Review</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const isExpanded = expandedId === s.id
                const isPanelOpen = notePanel?.submissionId === s.id
                // Übergangs-Matrix gespiegelt: REQUEST_CHANGES nur aus PENDING
                const canReview = s.status === 'PENDING' || s.status === 'CHANGES_REQUESTED'
                const canRequestChanges = s.status === 'PENDING'
                return (
                  <SubmissionRow
                    key={s.id}
                    submission={s}
                    isExpanded={isExpanded}
                    onToggleExpand={() => {
                      setExpandedId(isExpanded ? null : s.id)
                      if (isPanelOpen) setNotePanel(null)
                    }}
                    canReview={canReview}
                    canRequestChanges={canRequestChanges}
                    acting={acting}
                    notePanel={isPanelOpen ? notePanel : null}
                    noteText={noteText}
                    onNoteTextChange={setNoteText}
                    onApprovePublish={() => handleApprovePublish(s)}
                    onApproveOnly={() => handleApproveOnly(s)}
                    onOpenNotePanel={(action) => openNotePanel(s, action)}
                    onNoteSubmit={() => handleNoteSubmit(s)}
                    onNoteCancel={() => setNotePanel(null)}
                  />
                )
              })}
            </tbody>
          </table>
        </AdminCard>
      )}
    </div>
  )
}

// === Tabellen-Zeile + Aufklapper (Audio + Message + Review-Notiz) ===

interface SubmissionRowProps {
  submission: AdminSubmission
  isExpanded: boolean
  onToggleExpand: () => void
  canReview: boolean
  canRequestChanges: boolean
  acting: boolean
  notePanel: NotePanelState | null
  noteText: string
  onNoteTextChange: (v: string) => void
  onApprovePublish: () => void
  onApproveOnly: () => void
  onOpenNotePanel: (action: 'REQUEST_CHANGES' | 'REJECT') => void
  onNoteSubmit: () => void
  onNoteCancel: () => void
}

function SubmissionRow({
  submission: s,
  isExpanded,
  onToggleExpand,
  canReview,
  canRequestChanges,
  acting,
  notePanel,
  noteText,
  onNoteTextChange,
  onApprovePublish,
  onApproveOnly,
  onOpenNotePanel,
  onNoteSubmit,
  onNoteCancel,
}: SubmissionRowProps) {
  const t = s.track
  return (
    <>
      <tr className="border-b border-border/50 align-top">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Cover-Thumb — Fallback: Musik-Icon auf Obsidian */}
            {t.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.coverUrl}
                alt={`${t.title} cover`}
                className="w-10 h-10 rounded-lg object-cover shrink-0 bg-white/5"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-muted shrink-0">
                <Music2 size={16} />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-medium text-foreground">{t.title}</div>
              {t.artistProfile ? (
                <a
                  href={`/artists/${t.artistProfile.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-rasta-green hover:underline"
                >
                  {t.artistProfile.name}
                  <ExternalLink size={10} />
                </a>
              ) : (
                <span className="text-xs text-muted">no artist profile</span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="text-xs text-secondary whitespace-nowrap">
            {t.genre || '—'}
            {t.bpm !== null && ` · ${t.bpm} BPM`}
            {` · ${formatTime(t.duration)}`}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {t.aiDisclosure && (
              <span className="inline-block px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono text-[10px] uppercase">
                {AI_DISCLOSURE_SHORT[t.aiDisclosure] || t.aiDisclosure}
              </span>
            )}
            {t.isrc && (
              <span className="inline-block px-1.5 py-0.5 rounded bg-white/10 text-muted font-mono text-[10px]">
                {t.isrc}
              </span>
            )}
            {t.label && (
              <span className="inline-block px-1.5 py-0.5 rounded bg-white/10 text-muted font-mono text-[10px]">
                {t.label}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="text-xs text-secondary">@{s.submitter.username}</div>
          {/* Admin-only — Flow braucht die Adresse für Rückfragen */}
          <div className="text-xs text-muted">{s.submitter.email}</div>
        </td>
        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
          {new Date(s.createdAt).toLocaleDateString('en-GB')}
        </td>
        <td className="px-4 py-3">
          <StatusBadge value={s.status} />
          {s.reviewNote && !isExpanded && (
            <div className="mt-1 text-[10px] text-muted">has review note</div>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={onToggleExpand}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-rasta-green hover:underline cursor-pointer"
              aria-expanded={isExpanded}
              aria-label={`Toggle details of ${t.title}`}
            >
              Listen &amp; details
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </td>
      </tr>

      {/* Aufklapper: Audio-Vorhören + volle Message + reviewNote + Aktionen */}
      {isExpanded && (
        <tr className="border-b border-border/50 bg-black/20">
          <td colSpan={6} className="px-4 py-4">
            <div className="space-y-4 max-w-3xl">
              {/* Audio erst im Aufklapper mounten — kein Player-Grab, kein
                  Prefetch (preload="none"), Stream über die Track-Route */}
              <audio
                controls
                preload="none"
                src={`/api/tracks/${t.id}/stream`}
                className="w-full max-w-xl"
              >
                Your browser does not support the audio element.
              </audio>

              {s.message && (
                <div>
                  <div className="font-mono text-[10px] tracking-wider uppercase text-muted mb-1">
                    Artist message
                  </div>
                  {/* IMMER escaped gerendert (React-Default) — kein
                      dangerouslySetInnerHTML (XSS-Fehler-Szenario) */}
                  <p className="text-sm text-secondary whitespace-pre-wrap break-words">
                    {s.message}
                  </p>
                </div>
              )}

              {s.reviewNote && (
                <div>
                  <div className="font-mono text-[10px] tracking-wider uppercase text-muted mb-1">
                    Review note
                    {s.reviewedAt && (
                      <span className="opacity-60">
                        {' '}
                        ({new Date(s.reviewedAt).toLocaleDateString('en-GB')})
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-secondary whitespace-pre-wrap break-words">
                    {s.reviewNote}
                  </p>
                </div>
              )}

              <div className="text-xs text-muted font-mono">
                {t.filePath && <span>{t.filePath} · </span>}
                {t.isPublic ? 'public' : 'not public'}
              </div>

              {canReview && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <AdminButton size="sm" onClick={onApprovePublish} disabled={acting}>
                      Approve &amp; Publish
                    </AdminButton>
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      onClick={onApproveOnly}
                      disabled={acting}
                    >
                      Approve only
                    </AdminButton>
                    {canRequestChanges && (
                      <AdminButton
                        size="sm"
                        variant="accent"
                        onClick={() => onOpenNotePanel('REQUEST_CHANGES')}
                        disabled={acting}
                      >
                        Request changes
                      </AdminButton>
                    )}
                    <AdminButton
                      size="sm"
                      variant="danger"
                      onClick={() => onOpenNotePanel('REJECT')}
                      disabled={acting}
                    >
                      Reject
                    </AdminButton>
                  </div>

                  {/* Notiz-Panel für Request changes (Pflicht) / Reject (optional) */}
                  {notePanel && (
                    <div className="space-y-2">
                      <label className="block text-sm text-muted">
                        {notePanel.action === 'REQUEST_CHANGES' ? (
                          <>
                            Note for the artist <span className="text-rasta-yellow">(required)</span>
                          </>
                        ) : (
                          <>
                            Rejection note <span className="opacity-60">(optional, max 1000)</span>
                          </>
                        )}
                      </label>
                      <textarea
                        value={noteText}
                        onChange={(e) => onNoteTextChange(e.target.value)}
                        className={cn(adminInputClass, 'w-full min-h-[80px]')}
                        placeholder={
                          notePanel.action === 'REQUEST_CHANGES'
                            ? 'What should the artist change before re-submitting?'
                            : 'Why is this submission rejected?'
                        }
                        maxLength={1000}
                      />
                      <div className="flex gap-2">
                        <AdminButton
                          size="sm"
                          variant={notePanel.action === 'REJECT' ? 'danger' : 'accent'}
                          onClick={onNoteSubmit}
                          disabled={acting}
                          isLoading={acting}
                        >
                          {notePanel.action === 'REQUEST_CHANGES'
                            ? 'Send change request'
                            : 'Confirm rejection'}
                        </AdminButton>
                        <AdminButton size="sm" variant="ghost" onClick={onNoteCancel} disabled={acting}>
                          Cancel
                        </AdminButton>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
