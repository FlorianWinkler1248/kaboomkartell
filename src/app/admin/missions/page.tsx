'use client'

/**
 * Admin Missions — Cockpit für Mission-Board + Artist-Funnel + Socials (ADR-039)
 *
 * DREI Tabs in einer View:
 *   - Missions:     Tabelle + Create/Edit-Formular (alle Felder inkl. type/
 *                   status/progress/actionUrl/acceptable/sortOrder) +
 *                   Acceptances-Aufklapper mit COMPLETED-Toggle (Flows Handgriff).
 *   - Applications: Bewerbungs-Tabelle (status/mailSent-Badge!) + Status-Dropdown.
 *                   Kein DELETE in v1 — DSGVO-Löschweg ist manueller DB-Schritt.
 *   - Socials:      "Follow the pack"-Liste, Create/Edit + isActive-Toggle.
 *
 * Workflows: prozesse/kbk-mission-board.md + prozesse/kbk-artist-onboarding.md
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  X,
  Loader2,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/providers/ToastProvider'
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
  adminSelectClass,
} from '@/components/admin/ui'

// === String-Enums (SQLite-Konvention, ADR-039) ===
// Lokale Konstanten — constants.ts wird bewusst nicht angefasst
// (paralleler Workflow), und der Admin-Baum ist EN-only ohne i18n.
const MISSION_TYPES = ['DONATION', 'RECRUITING', 'PARTNERSHIP', 'GOAL'] as const
const MISSION_STATUSES = ['OPEN', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const
const APPLICATION_STATUSES = ['PENDING', 'REVIEWED', 'ACCEPTED', 'DECLINED'] as const

// === Badge-Farben (Obsidian-Palette wie PoolCard/Track-Status) ===
const MISSION_STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-rasta-green/15 text-rasta-green',
  PAUSED: 'bg-amber-500/15 text-amber-400',
  COMPLETED: 'bg-blue-500/15 text-blue-400',
  ARCHIVED: 'bg-white/10 text-muted',
}

const APPLICATION_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400',
  REVIEWED: 'bg-blue-500/15 text-blue-400',
  ACCEPTED: 'bg-rasta-green/15 text-rasta-green',
  DECLINED: 'bg-rasta-red/15 text-rasta-red',
}

const ACCEPTANCE_STATUS_COLORS: Record<string, string> = {
  ACCEPTED: 'bg-rasta-green/15 text-rasta-green',
  COMPLETED: 'bg-purple-500/15 text-purple-400',
  WITHDRAWN: 'bg-white/10 text-muted',
}

// === API-Shapes ===

interface AdminMission {
  id: string
  slug: string
  title: string
  type: string
  summary: string
  body: string
  status: string
  progressCurrent: number | null
  progressTarget: number | null
  progressUnit: string | null
  actionUrl: string | null
  actionLabel: string | null
  acceptable: boolean
  sortOrder: number
  createdBy: string
  createdAt: string
  acceptanceCounts: { total: number; accepted: number; completed: number; withdrawn: number }
}

interface AdminAcceptance {
  id: string
  status: string
  createdAt: string
  user: { id: string; username: string; displayName: string | null }
}

interface AdminApplication {
  id: string
  message: string
  links: string | null
  status: string
  mailSent: boolean
  createdAt: string
  user: { id: string; username: string; displayName: string | null; email: string; role: string }
}

interface AdminSocial {
  id: string
  platform: string
  handle: string
  url: string
  ownerLabel: string
  isActive: boolean
  sortOrder: number
}

// === Formular-Shapes (Strings für number-Inputs, Konvertierung beim Submit) ===

interface MissionFormState {
  title: string
  type: string
  status: string
  summary: string
  body: string
  actionUrl: string
  actionLabel: string
  progressCurrent: string
  progressTarget: string
  progressUnit: string
  acceptable: boolean
  sortOrder: string
}

const EMPTY_MISSION_FORM: MissionFormState = {
  title: '',
  type: 'GOAL',
  status: 'OPEN',
  summary: '',
  body: '',
  actionUrl: '',
  actionLabel: '',
  progressCurrent: '',
  progressTarget: '',
  progressUnit: '',
  acceptable: true,
  sortOrder: '0',
}

interface SocialFormState {
  platform: string
  handle: string
  url: string
  ownerLabel: string
  isActive: boolean
  sortOrder: string
}

const EMPTY_SOCIAL_FORM: SocialFormState = {
  platform: '',
  handle: '',
  url: '',
  ownerLabel: 'kbk',
  isActive: true,
  sortOrder: '0',
}

// Defensives Parsen des links-JSON-Strings — kaputtes JSON darf das Cockpit
// nicht crashen (Edge Case kbk-artist-onboarding). Nur http(s)-URLs rendern.
function parseApplicationLinks(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (l): l is string => typeof l === 'string' && /^https?:\/\//i.test(l)
    )
  } catch {
    return []
  }
}

// Zahl-Feld → number | null (leeres Feld = null, kaputte Eingabe = null).
// Rundet auf Integer — alle numerischen Schema-Felder (progress*, sortOrder)
// Dezimal-Betraege (z.B. 1250.50 EUR) sind erlaubt — Prisma-Feld ist Float.
function toNullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// Kleines Status-Badge — überall gleiche Optik
function StatusBadge({ value, colorMap }: { value: string; colorMap: Record<string, string> }) {
  return (
    <span
      className={cn(
        'inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase',
        colorMap[value] || 'bg-white/10 text-muted'
      )}
    >
      {value}
    </span>
  )
}

export default function AdminMissionsPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'missions' | 'applications' | 'socials'>('missions')

  // --- Missions-State ---
  const [missions, setMissions] = useState<AdminMission[]>([])
  const [loadingMissions, setLoadingMissions] = useState(true)
  const [showMissionForm, setShowMissionForm] = useState(false)
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null)
  const [missionForm, setMissionForm] = useState<MissionFormState>(EMPTY_MISSION_FORM)
  const [savingMission, setSavingMission] = useState(false)
  // Acceptances-Aufklapper
  const [expandedMissionId, setExpandedMissionId] = useState<string | null>(null)
  const [acceptances, setAcceptances] = useState<AdminAcceptance[]>([])
  const [loadingAcceptances, setLoadingAcceptances] = useState(false)

  // --- Applications-State ---
  const [applications, setApplications] = useState<AdminApplication[]>([])
  const [loadingApplications, setLoadingApplications] = useState(true)
  const [applicationFilter, setApplicationFilter] = useState('')
  const [expandedApplicationId, setExpandedApplicationId] = useState<string | null>(null)

  // --- Socials-State ---
  const [socials, setSocials] = useState<AdminSocial[]>([])
  const [loadingSocials, setLoadingSocials] = useState(true)
  const [showSocialForm, setShowSocialForm] = useState(false)
  const [editingSocialId, setEditingSocialId] = useState<string | null>(null)
  const [socialForm, setSocialForm] = useState<SocialFormState>(EMPTY_SOCIAL_FORM)
  const [savingSocial, setSavingSocial] = useState(false)

  // === Loader ===

  const loadMissions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/missions')
      const json = await res.json()
      if (json.success) {
        setMissions(json.data)
      } else {
        toast({ message: json.error || 'Error loading missions.', type: 'error' })
      }
    } catch {
      toast({ message: 'Error loading missions.', type: 'error' })
    } finally {
      setLoadingMissions(false)
    }
  }, [toast])

  const loadApplications = useCallback(
    async (statusFilter: string) => {
      setLoadingApplications(true)
      try {
        const query = statusFilter ? `?status=${statusFilter}` : ''
        const res = await fetch(`/api/admin/artist-applications${query}`)
        const json = await res.json()
        if (json.success) {
          setApplications(json.data)
        } else {
          toast({ message: json.error || 'Error loading applications.', type: 'error' })
        }
      } catch {
        toast({ message: 'Error loading applications.', type: 'error' })
      } finally {
        setLoadingApplications(false)
      }
    },
    [toast]
  )

  const loadSocials = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/social-accounts')
      const json = await res.json()
      if (json.success) {
        setSocials(json.data)
      } else {
        toast({ message: json.error || 'Error loading social accounts.', type: 'error' })
      }
    } catch {
      toast({ message: 'Error loading social accounts.', type: 'error' })
    } finally {
      setLoadingSocials(false)
    }
  }, [toast])

  useEffect(() => {
    loadMissions()
    loadApplications('')
    loadSocials()
  }, [loadMissions, loadApplications, loadSocials])

  // === Missions-Handler ===

  const openCreateMission = () => {
    setEditingMissionId(null)
    setMissionForm(EMPTY_MISSION_FORM)
    setShowMissionForm(true)
  }

  const openEditMission = (m: AdminMission) => {
    setEditingMissionId(m.id)
    setMissionForm({
      title: m.title,
      type: m.type,
      status: m.status,
      summary: m.summary,
      body: m.body,
      actionUrl: m.actionUrl ?? '',
      actionLabel: m.actionLabel ?? '',
      progressCurrent: m.progressCurrent !== null ? String(m.progressCurrent) : '',
      progressTarget: m.progressTarget !== null ? String(m.progressTarget) : '',
      progressUnit: m.progressUnit ?? '',
      acceptable: m.acceptable,
      sortOrder: String(m.sortOrder),
    })
    setShowMissionForm(true)
  }

  const handleSaveMission = async () => {
    if (!missionForm.title.trim() || !missionForm.summary.trim() || !missionForm.body.trim()) {
      toast({ message: 'Title, summary and body are required.', type: 'error' })
      return
    }
    setSavingMission(true)
    try {
      const isEdit = editingMissionId !== null
      // Create: optionale Felder weglassen (undefined). Update: leere Felder
      // als null senden, damit Flow z.B. eine actionUrl wieder räumen kann
      // (Nullable-Konvention wie updatePoolSchema).
      const optional = <T,>(v: T | null): T | null | undefined =>
        isEdit ? v : v === null ? undefined : v
      const payload = {
        title: missionForm.title.trim(),
        type: missionForm.type,
        summary: missionForm.summary.trim(),
        body: missionForm.body,
        actionUrl: optional(missionForm.actionUrl.trim() || null),
        actionLabel: optional(missionForm.actionLabel.trim() || null),
        progressCurrent: optional(toNullableNumber(missionForm.progressCurrent)),
        progressTarget: optional(toNullableNumber(missionForm.progressTarget)),
        progressUnit: optional(missionForm.progressUnit.trim() || null),
        acceptable: missionForm.acceptable,
        sortOrder: toNullableNumber(missionForm.sortOrder) ?? 0,
        // Status nur beim Edit — beim Create setzt der Server OPEN
        ...(isEdit ? { status: missionForm.status } : {}),
      }
      const res = await fetch(
        isEdit ? `/api/admin/missions/${editingMissionId}` : '/api/admin/missions',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const json = await res.json()
      if (json.success) {
        toast({ message: isEdit ? 'Mission updated.' : 'Mission created!', type: 'success' })
        setShowMissionForm(false)
        setEditingMissionId(null)
        setMissionForm(EMPTY_MISSION_FORM)
        loadMissions()
      } else {
        toast({ message: json.error || 'Error saving mission.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setSavingMission(false)
    }
  }

  // Hard-Delete — nur für ARCHIVED erlaubt (Server-Guard 409)
  const handleDeleteMission = async (m: AdminMission) => {
    if (!confirm(`Delete archived mission "${m.title}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/admin/missions/${m.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        toast({ message: 'Mission deleted.', type: 'success' })
        if (expandedMissionId === m.id) setExpandedMissionId(null)
        loadMissions()
      } else {
        toast({ message: json.error || 'Error deleting mission.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    }
  }

  // Acceptances-Aufklapper laden/schließen
  const handleToggleAcceptances = async (missionId: string) => {
    if (expandedMissionId === missionId) {
      setExpandedMissionId(null)
      setAcceptances([])
      return
    }
    setExpandedMissionId(missionId)
    setAcceptances([])
    setLoadingAcceptances(true)
    try {
      const res = await fetch(`/api/admin/missions/${missionId}`)
      const json = await res.json()
      if (json.success) {
        setAcceptances(json.data.acceptances || [])
      } else {
        toast({ message: json.error || 'Error loading acceptances.', type: 'error' })
      }
    } catch {
      toast({ message: 'Error loading acceptances.', type: 'error' })
    } finally {
      setLoadingAcceptances(false)
    }
  }

  // COMPLETED-Toggle — Flows Erfüllungs-Anerkennung (und Rückweg zu ACCEPTED)
  const handleToggleCompleted = async (acceptance: AdminAcceptance) => {
    const nextStatus = acceptance.status === 'COMPLETED' ? 'ACCEPTED' : 'COMPLETED'
    try {
      const res = await fetch(`/api/admin/mission-acceptances/${acceptance.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const json = await res.json()
      if (json.success) {
        toast({
          message: nextStatus === 'COMPLETED' ? 'Marked as completed.' : 'Set back to accepted.',
          type: 'success',
        })
        setAcceptances((prev) =>
          prev.map((a) => (a.id === acceptance.id ? { ...a, status: nextStatus } : a))
        )
        // Zähler in der Missions-Tabelle aktuell halten
        loadMissions()
      } else {
        toast({ message: json.error || 'Error updating acceptance.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    }
  }

  // === Applications-Handler ===

  const handleFilterApplications = (status: string) => {
    setApplicationFilter(status)
    loadApplications(status)
  }

  const handleApplicationStatus = async (app: AdminApplication, nextStatus: string) => {
    if (nextStatus === app.status) return
    try {
      const res = await fetch(`/api/admin/artist-applications/${app.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const json = await res.json()
      if (json.success) {
        toast({ message: `Application set to ${nextStatus}.`, type: 'success' })
        setApplications((prev) =>
          prev.map((a) => (a.id === app.id ? { ...a, status: nextStatus } : a))
        )
      } else {
        toast({ message: json.error || 'Error updating application.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    }
  }

  // === Socials-Handler ===

  const openCreateSocial = () => {
    setEditingSocialId(null)
    setSocialForm(EMPTY_SOCIAL_FORM)
    setShowSocialForm(true)
  }

  const openEditSocial = (s: AdminSocial) => {
    setEditingSocialId(s.id)
    setSocialForm({
      platform: s.platform,
      handle: s.handle,
      url: s.url,
      ownerLabel: s.ownerLabel,
      isActive: s.isActive,
      sortOrder: String(s.sortOrder),
    })
    setShowSocialForm(true)
  }

  const handleSaveSocial = async () => {
    if (!socialForm.platform.trim() || !socialForm.handle.trim() || !socialForm.url.trim()) {
      toast({ message: 'Platform, handle and URL are required.', type: 'error' })
      return
    }
    setSavingSocial(true)
    try {
      const isEdit = editingSocialId !== null
      const payload = {
        platform: socialForm.platform.trim(),
        handle: socialForm.handle.trim(),
        url: socialForm.url.trim(),
        ownerLabel: socialForm.ownerLabel.trim() || 'kbk',
        isActive: socialForm.isActive,
        sortOrder: toNullableNumber(socialForm.sortOrder) ?? 0,
      }
      const res = await fetch(
        isEdit ? `/api/admin/social-accounts/${editingSocialId}` : '/api/admin/social-accounts',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const json = await res.json()
      if (json.success) {
        toast({ message: isEdit ? 'Social account updated.' : 'Social account added!', type: 'success' })
        setShowSocialForm(false)
        setEditingSocialId(null)
        setSocialForm(EMPTY_SOCIAL_FORM)
        loadSocials()
      } else {
        toast({ message: json.error || 'Error saving social account.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setSavingSocial(false)
    }
  }

  const handleToggleSocialActive = async (s: AdminSocial, next: boolean) => {
    // Optimistic Update + Rollback (Muster Pools-Seite)
    setSocials((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: next } : x)))
    try {
      const res = await fetch(`/api/admin/social-accounts/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      })
      const json = await res.json()
      if (!json.success) {
        setSocials((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: !next } : x)))
        toast({ message: json.error || 'Error updating social account.', type: 'error' })
      } else {
        toast({ message: next ? 'Account visible on site.' : 'Account hidden.', type: 'success' })
      }
    } catch {
      setSocials((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: !next } : x)))
      toast({ message: 'Network error.', type: 'error' })
    }
  }

  const handleDeleteSocial = async (s: AdminSocial) => {
    if (!confirm(`Delete social account "${s.platform} / ${s.handle}"?`)) return
    try {
      const res = await fetch(`/api/admin/social-accounts/${s.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        toast({ message: 'Social account deleted.', type: 'success' })
        loadSocials()
      } else {
        toast({ message: json.error || 'Error deleting social account.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    }
  }

  // === Render ===

  const pendingCount = applications.filter((a) => a.status === 'PENDING').length

  const tabButton = (
    key: 'missions' | 'applications' | 'socials',
    label: string,
    count: number
  ) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={cn(
        'px-4 py-2 text-sm font-medium rounded-lg border transition-all cursor-pointer',
        tab === key
          ? 'text-rasta-green bg-rasta-green/10 border-rasta-green/30 text-glow-green'
          : 'text-secondary border-transparent hover:text-foreground hover:bg-elevated'
      )}
    >
      {label} <span className="opacity-60 font-mono text-xs">({count})</span>
    </button>
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        kickerTag="/M/"
        kicker="PACK BLACKBOARD"
        title="MISSIONS"
        description="Mission board, artist applications and the follow-the-pack social list."
        actions={
          tab === 'missions' ? (
            <AdminButton
              variant={showMissionForm ? 'ghost' : 'primary'}
              onClick={() => (showMissionForm ? setShowMissionForm(false) : openCreateMission())}
            >
              {showMissionForm ? <X size={16} /> : <Plus size={16} />}
              {showMissionForm ? 'Cancel' : 'New Mission'}
            </AdminButton>
          ) : tab === 'socials' ? (
            <AdminButton
              variant={showSocialForm ? 'ghost' : 'primary'}
              onClick={() => (showSocialForm ? setShowSocialForm(false) : openCreateSocial())}
            >
              {showSocialForm ? <X size={16} /> : <Plus size={16} />}
              {showSocialForm ? 'Cancel' : 'New Account'}
            </AdminButton>
          ) : undefined
        }
      />

      {/* Tab-Leiste */}
      <div className="flex gap-2 flex-wrap">
        {tabButton('missions', 'Missions', missions.length)}
        {tabButton('applications', 'Applications', applications.length)}
        {tabButton('socials', 'Socials', socials.length)}
      </div>

      {/* ============================== MISSIONS ============================== */}
      {tab === 'missions' && (
        <>
          {/* Create/Edit-Formular — die eine Akzent-Karte der Seite, wenn offen */}
          {showMissionForm && (
            <AdminCard framed className="space-y-4">
              <h3 className="font-semibold text-foreground">
                {editingMissionId ? 'Edit Mission' : 'Create Mission'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted mb-1">Title *</label>
                  <input
                    type="text"
                    value={missionForm.title}
                    onChange={(e) => setMissionForm({ ...missionForm, title: e.target.value })}
                    className={cn(adminInputClass, 'w-full')}
                    placeholder="Recruit human artists"
                    maxLength={120}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-muted mb-1">Type *</label>
                    <select
                      value={missionForm.type}
                      onChange={(e) => setMissionForm({ ...missionForm, type: e.target.value })}
                      className={cn(adminSelectClass, 'w-full')}
                    >
                      {MISSION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editingMissionId ? (
                    <div>
                      <label className="block text-sm text-muted mb-1">Status</label>
                      <select
                        value={missionForm.status}
                        onChange={(e) => setMissionForm({ ...missionForm, status: e.target.value })}
                        className={cn(adminSelectClass, 'w-full')}
                      >
                        {MISSION_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm text-muted mb-1">Sort Order</label>
                      <input
                        type="number"
                        value={missionForm.sortOrder}
                        onChange={(e) => setMissionForm({ ...missionForm, sortOrder: e.target.value })}
                        className={cn(adminInputClass, 'w-full')}
                      />
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-muted mb-1">Summary * <span className="opacity-60">(board card, max 300)</span></label>
                  <textarea
                    value={missionForm.summary}
                    onChange={(e) => setMissionForm({ ...missionForm, summary: e.target.value })}
                    className={cn(adminInputClass, 'w-full min-h-[60px]')}
                    placeholder="Short pitch shown on the mission board grid."
                    maxLength={300}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-muted mb-1">Body * <span className="opacity-60">(Markdown — full instructions incl. how to report back)</span></label>
                  <textarea
                    value={missionForm.body}
                    onChange={(e) => setMissionForm({ ...missionForm, body: e.target.value })}
                    className={cn(adminInputClass, 'w-full min-h-[160px] font-mono text-xs')}
                    placeholder={'## The mission\n\nWhat to do, step by step...'}
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Action URL <span className="opacity-60">(e.g. donation link — public button)</span></label>
                  <input
                    type="text"
                    value={missionForm.actionUrl}
                    onChange={(e) => setMissionForm({ ...missionForm, actionUrl: e.target.value })}
                    className={cn(adminInputClass, 'w-full')}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Action Label</label>
                  <input
                    type="text"
                    value={missionForm.actionLabel}
                    onChange={(e) => setMissionForm({ ...missionForm, actionLabel: e.target.value })}
                    className={cn(adminInputClass, 'w-full')}
                    placeholder="Donate now"
                    maxLength={40}
                  />
                </div>
                {/* Fortschritt — MANUELL gepflegt, keine Fake-Automatik (Vanity-Disziplin) */}
                <div className="grid grid-cols-3 gap-4 md:col-span-2">
                  <div>
                    <label className="block text-sm text-muted mb-1">Progress Current</label>
                    <input
                      type="number"
                      min="0"
                      value={missionForm.progressCurrent}
                      onChange={(e) => setMissionForm({ ...missionForm, progressCurrent: e.target.value })}
                      className={cn(adminInputClass, 'w-full')}
                      placeholder="1250"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted mb-1">Progress Target</label>
                    <input
                      type="number"
                      min="0"
                      value={missionForm.progressTarget}
                      onChange={(e) => setMissionForm({ ...missionForm, progressTarget: e.target.value })}
                      className={cn(adminInputClass, 'w-full')}
                      placeholder="5000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted mb-1">Unit</label>
                    <input
                      type="text"
                      value={missionForm.progressUnit}
                      onChange={(e) => setMissionForm({ ...missionForm, progressUnit: e.target.value })}
                      className={cn(adminInputClass, 'w-full')}
                      placeholder="EUR"
                      maxLength={20}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-6 md:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={missionForm.acceptable}
                      onChange={(e) => setMissionForm({ ...missionForm, acceptable: e.target.checked })}
                      className="accent-rasta-green"
                    />
                    Acceptable <span className="text-muted">(T2 users can accept this mission)</span>
                  </label>
                  {editingMissionId && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-muted">Sort Order</label>
                      <input
                        type="number"
                        value={missionForm.sortOrder}
                        onChange={(e) => setMissionForm({ ...missionForm, sortOrder: e.target.value })}
                        className={cn(adminInputClass, 'w-24')}
                      />
                    </div>
                  )}
                </div>
              </div>
              <AdminButton
                onClick={handleSaveMission}
                disabled={savingMission || !missionForm.title.trim()}
                isLoading={savingMission}
              >
                {editingMissionId ? 'Save Changes' : 'Create Mission'}
              </AdminButton>
            </AdminCard>
          )}

          {/* Missions-Tabelle */}
          {loadingMissions ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-muted" size={32} />
            </div>
          ) : missions.length === 0 ? (
            <AdminCard className="text-center py-10 text-muted text-sm">
              No missions yet — hang the first task on the blackboard.
            </AdminCard>
          ) : (
            <AdminCard padding="none" className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-muted font-mono text-[10px] tracking-wider uppercase border-b border-border">
                    <th className="px-4 py-3">Mission</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Accepted</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {missions.map((m) => (
                    <MissionRow
                      key={m.id}
                      mission={m}
                      expanded={expandedMissionId === m.id}
                      acceptances={expandedMissionId === m.id ? acceptances : []}
                      loadingAcceptances={expandedMissionId === m.id && loadingAcceptances}
                      onEdit={() => openEditMission(m)}
                      onDelete={() => handleDeleteMission(m)}
                      onToggleAcceptances={() => handleToggleAcceptances(m.id)}
                      onToggleCompleted={handleToggleCompleted}
                    />
                  ))}
                </tbody>
              </table>
            </AdminCard>
          )}
        </>
      )}

      {/* ============================ APPLICATIONS ============================ */}
      {tab === 'applications' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={applicationFilter}
              onChange={(e) => handleFilterApplications(e.target.value)}
              className={adminSelectClass}
            >
              <option value="">All statuses</option>
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {pendingCount > 0 && (
              <span className="text-xs text-amber-400 font-mono">
                {pendingCount} pending review
              </span>
            )}
          </div>

          {loadingApplications ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-muted" size={32} />
            </div>
          ) : applications.length === 0 ? (
            <AdminCard className="text-center py-10 text-muted text-sm">
              No artist applications{applicationFilter ? ` with status ${applicationFilter}` : ''} yet.
            </AdminCard>
          ) : (
            <AdminCard padding="none" className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-muted font-mono text-[10px] tracking-wider uppercase border-b border-border">
                    <th className="px-4 py-3">Applicant</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3">Mail</th>
                    <th className="px-4 py-3">Applied</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => {
                    const links = parseApplicationLinks(app.links)
                    const isExpanded = expandedApplicationId === app.id
                    return (
                      <tr key={app.id} className="border-b border-border/50 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {app.user.displayName || app.user.username}
                          </div>
                          <div className="text-xs text-muted">@{app.user.username}</div>
                          {/* Admin-only — Flow braucht die Adresse für die Antwort */}
                          <div className="text-xs text-muted">{app.user.email}</div>
                          {app.user.role === 'KUENSTLER' && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono text-[10px] uppercase">
                              Artist
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[360px]">
                          {/* message wird IMMER escaped gerendert (React-Default) —
                              kein dangerouslySetInnerHTML (XSS-Fehler-Szenario) */}
                          <p className={cn('text-secondary whitespace-pre-wrap break-words', !isExpanded && 'line-clamp-3')}>
                            {app.message}
                          </p>
                          {(app.message.length > 200 || links.length > 0) && (
                            <button
                              onClick={() => setExpandedApplicationId(isExpanded ? null : app.id)}
                              className="mt-1 text-xs text-rasta-green hover:underline cursor-pointer"
                            >
                              {isExpanded ? 'Show less' : 'Show full application'}
                            </button>
                          )}
                          {isExpanded && links.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {links.map((link) => (
                                <li key={link}>
                                  <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-rasta-green hover:underline break-all"
                                  >
                                    <ExternalLink size={12} className="shrink-0" />
                                    {link}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {/* mailSent=false MUSS sichtbar sein — kein stiller Verlust */}
                          <span
                            className={cn(
                              'inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase',
                              app.mailSent
                                ? 'bg-rasta-green/15 text-rasta-green'
                                : 'bg-rasta-red/15 text-rasta-red'
                            )}
                          >
                            {app.mailSent ? 'Mail sent' : 'Mail failed'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                          {new Date(app.createdAt).toLocaleDateString('en-GB')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1.5">
                            <StatusBadge value={app.status} colorMap={APPLICATION_STATUS_COLORS} />
                            <select
                              value={app.status}
                              onChange={(e) => handleApplicationStatus(app, e.target.value)}
                              className={cn(adminSelectClass, 'text-xs py-1')}
                            >
                              {APPLICATION_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </AdminCard>
          )}
        </>
      )}

      {/* =============================== SOCIALS =============================== */}
      {tab === 'socials' && (
        <>
          {showSocialForm && (
            <AdminCard framed className="space-y-4">
              <h3 className="font-semibold text-foreground">
                {editingSocialId ? 'Edit Social Account' : 'Add Social Account'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted mb-1">Platform *</label>
                  <input
                    type="text"
                    value={socialForm.platform}
                    onChange={(e) => setSocialForm({ ...socialForm, platform: e.target.value })}
                    className={cn(adminInputClass, 'w-full')}
                    placeholder="instagram / tiktok / soundcloud ..."
                    maxLength={30}
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Handle *</label>
                  <input
                    type="text"
                    value={socialForm.handle}
                    onChange={(e) => setSocialForm({ ...socialForm, handle: e.target.value })}
                    className={cn(adminInputClass, 'w-full')}
                    placeholder="@kaboomkartell"
                    maxLength={60}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-muted mb-1">URL * <span className="opacity-60">(http/https only)</span></label>
                  <input
                    type="text"
                    value={socialForm.url}
                    onChange={(e) => setSocialForm({ ...socialForm, url: e.target.value })}
                    className={cn(adminInputClass, 'w-full')}
                    placeholder="https://instagram.com/kaboomkartell"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Owner <span className="opacity-60">(kbk | boomy | artist name)</span></label>
                  <input
                    type="text"
                    value={socialForm.ownerLabel}
                    onChange={(e) => setSocialForm({ ...socialForm, ownerLabel: e.target.value })}
                    className={cn(adminInputClass, 'w-full')}
                    placeholder="kbk"
                    maxLength={60}
                  />
                </div>
                <div className="flex items-end gap-6">
                  <div>
                    <label className="block text-sm text-muted mb-1">Sort Order</label>
                    <input
                      type="number"
                      value={socialForm.sortOrder}
                      onChange={(e) => setSocialForm({ ...socialForm, sortOrder: e.target.value })}
                      className={cn(adminInputClass, 'w-24')}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={socialForm.isActive}
                      onChange={(e) => setSocialForm({ ...socialForm, isActive: e.target.checked })}
                      className="accent-rasta-green"
                    />
                    Active (visible on site)
                  </label>
                </div>
              </div>
              <AdminButton
                onClick={handleSaveSocial}
                disabled={savingSocial || !socialForm.platform.trim() || !socialForm.url.trim()}
                isLoading={savingSocial}
              >
                {editingSocialId ? 'Save Changes' : 'Add Account'}
              </AdminButton>
            </AdminCard>
          )}

          {loadingSocials ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-muted" size={32} />
            </div>
          ) : socials.length === 0 ? (
            <AdminCard className="text-center py-10 text-muted text-sm">
              No social accounts yet — add the first one for the pack to follow.
            </AdminCard>
          ) : (
            <AdminCard padding="none" className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="text-left text-muted font-mono text-[10px] tracking-wider uppercase border-b border-border">
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Handle</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Sort</th>
                    <th className="px-4 py-3">Visible</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {socials.map((s) => (
                    <tr key={s.id} className="border-b border-border/50">
                      <td className="px-4 py-3 font-medium text-foreground capitalize">{s.platform}</td>
                      <td className="px-4 py-3">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-rasta-green hover:underline"
                        >
                          {s.handle}
                          <ExternalLink size={12} />
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-white/10 text-secondary font-mono text-[10px] uppercase">
                          {s.ownerLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted font-mono text-xs">{s.sortOrder}</td>
                      <td className="px-4 py-3">
                        {/* isActive-Toggle — Ausblenden ohne Löschen */}
                        <button
                          onClick={() => handleToggleSocialActive(s, !s.isActive)}
                          role="switch"
                          aria-checked={s.isActive}
                          aria-label={`Toggle visibility of ${s.platform} account`}
                          className={cn(
                            'relative w-9 h-5 rounded-full transition-colors cursor-pointer',
                            s.isActive ? 'bg-rasta-green/70' : 'bg-white/15'
                          )}
                        >
                          <span
                            className={cn(
                              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                              s.isActive ? 'left-[18px]' : 'left-0.5'
                            )}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditSocial(s)}
                            className="p-1.5 text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors cursor-pointer"
                            aria-label={`Edit ${s.platform} account`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteSocial(s)}
                            className="p-1.5 text-muted hover:text-rasta-red rounded-lg hover:bg-elevated transition-colors cursor-pointer"
                            aria-label={`Delete ${s.platform} account`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminCard>
          )}
        </>
      )}
    </div>
  )
}

// === Missions-Tabellen-Zeile + Acceptances-Aufklapper ===

interface MissionRowProps {
  mission: AdminMission
  expanded: boolean
  acceptances: AdminAcceptance[]
  loadingAcceptances: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleAcceptances: () => void
  onToggleCompleted: (acceptance: AdminAcceptance) => void
}

function MissionRow({
  mission,
  expanded,
  acceptances,
  loadingAcceptances,
  onEdit,
  onDelete,
  onToggleAcceptances,
  onToggleCompleted,
}: MissionRowProps) {
  const hasProgress = mission.progressTarget !== null && mission.progressTarget > 0
  // Balken bei 100 % cappen — echte Zahlen bleiben sichtbar
  // (Fehler-Szenario "Fortschritt > Ziel"; Target 0/null → gar kein Prozentwert)
  const progressPct = hasProgress
    ? Math.min(100, Math.round(((mission.progressCurrent ?? 0) / (mission.progressTarget as number)) * 100))
    : null

  return (
    <>
      <tr className={cn('border-b border-border/50 align-top', mission.status === 'ARCHIVED' && 'opacity-60')}>
        <td className="px-4 py-3">
          <div className="font-medium text-foreground">{mission.title}</div>
          <div className="text-xs text-muted font-mono">/{mission.slug}</div>
          {/* Attribution — createdBy ist Anzeige, kein Auth-Feld */}
          {mission.createdBy === 'boomy' && (
            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono text-[10px] uppercase">
              Called by Boomy
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-secondary">{mission.type}</span>
        </td>
        <td className="px-4 py-3">
          <StatusBadge value={mission.status} colorMap={MISSION_STATUS_COLORS} />
        </td>
        <td className="px-4 py-3">
          {hasProgress ? (
            <div className="min-w-[120px]">
              <div className="text-xs text-secondary mb-1">
                {mission.progressCurrent ?? 0} / {mission.progressTarget} {mission.progressUnit || ''}
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-rasta-green transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          ) : mission.progressCurrent !== null ? (
            // Ohne Target nur der absolute Zähler (keine Division durch 0)
            <span className="text-xs text-secondary">
              {mission.progressCurrent} {mission.progressUnit || ''}
            </span>
          ) : (
            <span className="text-xs text-muted">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          {mission.acceptable ? (
            <button
              onClick={onToggleAcceptances}
              className="inline-flex items-center gap-1 text-xs text-rasta-green hover:underline cursor-pointer"
            >
              {mission.acceptanceCounts.accepted + mission.acceptanceCounts.completed} wolves
              {mission.acceptanceCounts.completed > 0 && (
                <span className="text-purple-400">({mission.acceptanceCounts.completed} done)</span>
              )}
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : (
            <span className="text-xs text-muted">not acceptable</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={onEdit}
              className="p-1.5 text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors cursor-pointer"
              aria-label={`Edit mission ${mission.title}`}
            >
              <Pencil size={14} />
            </button>
            {/* Hard-Delete nur für ARCHIVED (Server-Guard 409) — für live
                sichtbare Missionen ist Archivieren der Soft-Delete-Weg */}
            {mission.status === 'ARCHIVED' && (
              <button
                onClick={onDelete}
                className="p-1.5 text-muted hover:text-rasta-red rounded-lg hover:bg-elevated transition-colors cursor-pointer"
                aria-label={`Delete mission ${mission.title}`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Acceptances-Aufklapper */}
      {expanded && (
        <tr className="border-b border-border/50 bg-black/20">
          <td colSpan={6} className="px-4 py-3">
            {loadingAcceptances ? (
              <div className="flex items-center gap-2 text-muted text-sm py-2">
                <Loader2 className="animate-spin" size={14} /> Loading acceptances...
              </div>
            ) : acceptances.length === 0 ? (
              <div className="text-sm text-muted py-2">No wolf has accepted this mission yet.</div>
            ) : (
              <ul className="space-y-2">
                {acceptances.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-foreground">
                        {a.user.displayName || a.user.username}
                        <span className="text-muted text-xs ml-1">@{a.user.username}</span>
                      </span>
                      <StatusBadge value={a.status} colorMap={ACCEPTANCE_STATUS_COLORS} />
                    </div>
                    {/* COMPLETED-Toggle — nur Flow bescheinigt Erfüllung.
                        WITHDRAWN bleibt read-only (Audit-Spur des Users). */}
                    {a.status !== 'WITHDRAWN' && (
                      <AdminButton
                        size="sm"
                        variant={a.status === 'COMPLETED' ? 'ghost' : 'secondary'}
                        onClick={() => onToggleCompleted(a)}
                      >
                        {a.status === 'COMPLETED' ? 'Set back to accepted' : 'Mark completed'}
                      </AdminButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
