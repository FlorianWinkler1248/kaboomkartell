'use client'

/**
 * Admin Artist Profiles — Cockpit für das Artist-Ökosystem (ADR-041 Welle 3)
 *
 * EINE View für Flows Outreach-Handgriffe:
 *   - Create/Edit-Formular (Collapsible wie Missions): Name/Slug/Bio/Bilder/
 *     Socials/isPublished/sortOrder. Slug optional — Server generiert aus Name.
 *   - Tabelle: Avatar-Thumb, Status-Chips (PUBLISHED/HIDDEN, CLAIMED/UNCLAIMED,
 *     INVITE ACTIVE), Track-Zahl, Link aufs öffentliche Profil.
 *   - Invite-Dialog: expiresInDays → POST invite → der KLARTEXT-Token wird
 *     GENAU EINMAL gezeigt (DB hält nur den Hash) — Copy-Pflicht sofort.
 *   - Delete nur solange unclaimed UND ohne Tracks (Server-Guard 409).
 *
 * Muster: src/app/admin/missions/page.tsx (Envelope, optimistic+rollback, Toast).
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  X,
  Loader2,
  Pencil,
  Trash2,
  ExternalLink,
  KeyRound,
  Copy,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/providers/ToastProvider'
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
} from '@/components/admin/ui'

// Basis fürs Claim-Link-Compose — der Invite-Link geht per DM an den Künstler,
// deshalb immer die öffentliche Domain, nie window.location (Admin ggf. lokal).
const PUBLIC_ORIGIN = 'https://kaboomkartell.com'

// === API-Shapes (GET /api/admin/artist-profiles) ===

interface AdminArtistProfile {
  id: string
  slug: string
  name: string
  bio: string | null
  avatarUrl: string | null
  headerUrl: string | null
  socialSoundcloud: string | null
  socialInstagram: string | null
  socialTelegram: string | null
  socialWebsite: string | null
  isPublished: boolean
  sortOrder: number
  claimed: boolean
  claimedAt: string | null
  claimedBy: { username: string; email: string } | null
  inviteActive: boolean
  inviteExpiresAt: string | null
  trackCount: number
  createdAt: string
}

// === Formular-Shape (Strings für number-Inputs, Konvertierung beim Submit) ===

interface ProfileFormState {
  name: string
  slug: string
  bio: string
  avatarUrl: string
  headerUrl: string
  socialSoundcloud: string
  socialInstagram: string
  socialTelegram: string
  socialWebsite: string
  isPublished: boolean
  sortOrder: string
}

const EMPTY_PROFILE_FORM: ProfileFormState = {
  name: '',
  slug: '',
  bio: '',
  avatarUrl: '',
  headerUrl: '',
  socialSoundcloud: '',
  socialInstagram: '',
  socialTelegram: '',
  socialWebsite: '',
  isPublished: false,
  sortOrder: '0',
}

// Die 4 Social-Felder als Loop-Konfiguration — hält das Formular kompakt
const SOCIAL_FIELDS: { key: keyof ProfileFormState; label: string; placeholder: string }[] = [
  { key: 'socialSoundcloud', label: 'SoundCloud', placeholder: 'https://soundcloud.com/...' },
  { key: 'socialInstagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
  { key: 'socialTelegram', label: 'Telegram', placeholder: 'https://t.me/...' },
  { key: 'socialWebsite', label: 'Website', placeholder: 'https://...' },
]

// Kleines Status-Chip — gleiche Optik wie StatusBadge der Missions-Seite
function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-block px-2 py-0.5 rounded font-mono text-[10px] tracking-wider uppercase',
        className
      )}
    >
      {children}
    </span>
  )
}

export default function AdminArtistProfilesPage() {
  const { toast } = useToast()

  const [profiles, setProfiles] = useState<AdminArtistProfile[]>([])
  const [loading, setLoading] = useState(true)

  // --- Create/Edit-Form ---
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM)
  const [saving, setSaving] = useState(false)

  // --- Invite-Dialog (2 Phasen: Tage wählen → Token GENAU EINMAL zeigen) ---
  const [inviteProfile, setInviteProfile] = useState<AdminArtistProfile | null>(null)
  const [inviteDays, setInviteDays] = useState('14')
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [inviteResult, setInviteResult] = useState<{
    token: string
    claimUrl: string
    expiresAt: string
  } | null>(null)

  // === Loader ===

  const loadProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/artist-profiles')
      const json = await res.json()
      if (json.success) {
        setProfiles(json.data)
      } else {
        toast({ message: json.error || 'Error loading artist profiles.', type: 'error' })
      }
    } catch {
      toast({ message: 'Error loading artist profiles.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  // === Create/Edit-Handler ===

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_PROFILE_FORM)
    setShowForm(true)
  }

  const openEdit = (p: AdminArtistProfile) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      slug: p.slug,
      bio: p.bio ?? '',
      avatarUrl: p.avatarUrl ?? '',
      headerUrl: p.headerUrl ?? '',
      socialSoundcloud: p.socialSoundcloud ?? '',
      socialInstagram: p.socialInstagram ?? '',
      socialTelegram: p.socialTelegram ?? '',
      socialWebsite: p.socialWebsite ?? '',
      isPublished: p.isPublished,
      sortOrder: String(p.sortOrder),
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ message: 'Name is required.', type: 'error' })
      return
    }
    setSaving(true)
    try {
      const isEdit = editingId !== null
      // Create: leere optionale Felder weglassen. Edit: leere Strings mitsenden —
      // die Route mappt '' → null (Räumen-Konvention wie Missions-PUT).
      // Slug-Ausnahme: das Update-Schema verlangt regex+min(2), leer = nicht ändern.
      const optionalStr = (v: string): string | undefined =>
        isEdit ? v.trim() : v.trim() || undefined
      const payload = {
        name: form.name.trim(),
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        bio: optionalStr(form.bio),
        avatarUrl: optionalStr(form.avatarUrl),
        headerUrl: optionalStr(form.headerUrl),
        socialSoundcloud: optionalStr(form.socialSoundcloud),
        socialInstagram: optionalStr(form.socialInstagram),
        socialTelegram: optionalStr(form.socialTelegram),
        socialWebsite: optionalStr(form.socialWebsite),
        isPublished: form.isPublished,
        sortOrder: Number.isFinite(Number(form.sortOrder)) ? Number(form.sortOrder) : 0,
      }
      const res = await fetch(
        isEdit ? `/api/admin/artist-profiles/${editingId}` : '/api/admin/artist-profiles',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const json = await res.json()
      if (json.success) {
        toast({ message: isEdit ? 'Profile updated.' : 'Profile created!', type: 'success' })
        setShowForm(false)
        setEditingId(null)
        setForm(EMPTY_PROFILE_FORM)
        loadProfiles()
      } else {
        // 409 = Slug kollidiert mit einem Username — Server-Text durchreichen
        toast({ message: json.error || 'Error saving profile.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // Publish-Toggle — Optimistic Update + Rollback (Muster Socials-Toggle)
  const handleTogglePublished = async (p: AdminArtistProfile, next: boolean) => {
    setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, isPublished: next } : x)))
    try {
      const res = await fetch(`/api/admin/artist-profiles/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: next }),
      })
      const json = await res.json()
      if (!json.success) {
        setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, isPublished: !next } : x)))
        toast({ message: json.error || 'Error updating profile.', type: 'error' })
      } else {
        toast({ message: next ? 'Profile is live on /artists.' : 'Profile hidden.', type: 'success' })
      }
    } catch {
      setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, isPublished: !next } : x)))
      toast({ message: 'Network error.', type: 'error' })
    }
  }

  // Delete — nur unclaimed + ohne Tracks (die Buttons spiegeln den Server-Guard)
  const handleDelete = async (p: AdminArtistProfile) => {
    if (!confirm(`Delete artist profile "${p.name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/admin/artist-profiles/${p.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        toast({ message: 'Profile deleted.', type: 'success' })
        loadProfiles()
      } else {
        toast({ message: json.error || 'Error deleting profile.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    }
  }

  // === Invite-Handler ===

  const openInvite = (p: AdminArtistProfile) => {
    setInviteProfile(p)
    setInviteDays('14')
    setInviteResult(null)
  }

  // Dialog schließen — nach einem erzeugten Token die Liste neu laden
  // (inviteActive-Chip aktuell halten). Der Token selbst ist dann WEG.
  const closeInvite = () => {
    const hadResult = inviteResult !== null
    setInviteProfile(null)
    setInviteResult(null)
    if (hadResult) loadProfiles()
  }

  const handleCreateInvite = async () => {
    if (!inviteProfile) return
    const days = Number(inviteDays)
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      toast({ message: 'Expiry must be between 1 and 90 days.', type: 'error' })
      return
    }
    setCreatingInvite(true)
    try {
      const res = await fetch(`/api/admin/artist-profiles/${inviteProfile.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInDays: days }),
      })
      const json = await res.json()
      if (json.success) {
        setInviteResult({
          token: json.data.token,
          claimUrl: `${PUBLIC_ORIGIN}${json.data.claimPath}`,
          expiresAt: json.data.expiresAt,
        })
      } else {
        toast({ message: json.error || 'Error creating invite.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setCreatingInvite(false)
    }
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ message: 'Copied to clipboard.', type: 'success' })
    } catch {
      toast({ message: 'Copy failed — select the text manually.', type: 'error' })
    }
  }

  // === Render ===

  return (
    <div className="space-y-6">
      <AdminPageHeader
        kickerTag="/A/"
        kicker="ARTIST ECOSYSTEM"
        title="ARTIST PROFILES"
        description="Curated artist pages, claim invites and publish control (ADR-041)."
        actions={
          <AdminButton
            variant={showForm ? 'ghost' : 'primary'}
            onClick={() => (showForm ? setShowForm(false) : openCreate())}
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Cancel' : 'New Profile'}
          </AdminButton>
        }
      />

      {/* Create/Edit-Formular — die eine Akzent-Karte der Seite, wenn offen */}
      {showForm && (
        <AdminCard framed className="space-y-4">
          <h3 className="font-semibold text-foreground">
            {editingId ? 'Edit Profile' : 'Create Profile'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
                placeholder="DJ Nightcrawler"
                maxLength={120}
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">
                Slug <span className="opacity-60">(optional — auto from name)</span>
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className={cn(adminInputClass, 'w-full font-mono text-xs')}
                placeholder="dj-nightcrawler"
                maxLength={80}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-muted mb-1">
                Bio <span className="opacity-60">(max 1000)</span>
              </label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                className={cn(adminInputClass, 'w-full min-h-[80px]')}
                placeholder="Short artist bio shown on the public page."
                maxLength={1000}
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Avatar URL</label>
              <input
                type="text"
                value={form.avatarUrl}
                onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
                placeholder="/uploads/... or https://..."
                maxLength={300}
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Header URL</label>
              <input
                type="text"
                value={form.headerUrl}
                onChange={(e) => setForm({ ...form, headerUrl: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
                placeholder="/uploads/... or https://..."
                maxLength={300}
              />
            </div>
            {SOCIAL_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-sm text-muted mb-1">{f.label}</label>
                <input
                  type="text"
                  value={form[f.key] as string}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className={cn(adminInputClass, 'w-full')}
                  placeholder={f.placeholder}
                  maxLength={300}
                />
              </div>
            ))}
            <div className="flex items-end gap-6 md:col-span-2">
              <div>
                <label className="block text-sm text-muted mb-1">Sort Order</label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  className={cn(adminInputClass, 'w-24')}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                  className="accent-rasta-green"
                />
                Published <span className="text-muted">(visible on /artists)</span>
              </label>
            </div>
          </div>
          <AdminButton onClick={handleSave} disabled={saving || !form.name.trim()} isLoading={saving}>
            {editingId ? 'Save Changes' : 'Create Profile'}
          </AdminButton>
        </AdminCard>
      )}

      {/* Profil-Tabelle */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-muted" size={32} />
        </div>
      ) : profiles.length === 0 ? (
        <AdminCard className="text-center py-10 text-muted text-sm">
          No artist profiles yet — create the first one for the outreach.
        </AdminCard>
      ) : (
        <AdminCard padding="none" className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-muted font-mono text-[10px] tracking-wider uppercase border-b border-border">
                <th className="px-4 py-3">Artist</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tracks</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-border/50 align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {/* Avatar-Thumb — Fallback: Initial auf Obsidian */}
                      {p.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.avatarUrl}
                          alt={`${p.name} avatar`}
                          className="w-9 h-9 rounded-lg object-cover shrink-0 bg-white/5"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-muted font-mono text-xs shrink-0">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{p.name}</div>
                        <div className="text-xs text-muted font-mono">/{p.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5 max-w-[260px]">
                      {p.isPublished ? (
                        <Chip className="bg-rasta-green/15 text-rasta-green">Published</Chip>
                      ) : (
                        <Chip className="bg-white/10 text-muted">Hidden</Chip>
                      )}
                      {p.claimed ? (
                        <Chip className="bg-blue-500/15 text-blue-400">
                          Claimed by {p.claimedBy?.username ?? '?'}
                        </Chip>
                      ) : (
                        <Chip className="bg-amber-500/15 text-amber-400">Unclaimed</Chip>
                      )}
                      {/* Invite-Chip nur solange unclaimed — nach dem Claim ist er Geschichte */}
                      {!p.claimed && p.inviteActive && (
                        <Chip className="bg-orange-500/15 text-orange-400">
                          Invite until{' '}
                          {p.inviteExpiresAt
                            ? new Date(p.inviteExpiresAt).toLocaleDateString('en-GB')
                            : '?'}
                        </Chip>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{p.trackCount}</td>
                  <td className="px-4 py-3">
                    {/* isPublished-Toggle — Ausblenden ohne Löschen */}
                    <button
                      onClick={() => handleTogglePublished(p, !p.isPublished)}
                      role="switch"
                      aria-checked={p.isPublished}
                      aria-label={`Toggle publish state of ${p.name}`}
                      className={cn(
                        'relative w-9 h-5 rounded-full transition-colors cursor-pointer',
                        p.isPublished ? 'bg-rasta-green/70' : 'bg-white/15'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                          p.isPublished ? 'left-[18px]' : 'left-0.5'
                        )}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/artists/${p.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors"
                        aria-label={`Open public page of ${p.name}`}
                        title="Open public page"
                      >
                        <ExternalLink size={14} />
                      </a>
                      {/* Invite nur solange unclaimed (Server-Guard 409 gespiegelt) */}
                      {!p.claimed && (
                        <button
                          onClick={() => openInvite(p)}
                          className="p-1.5 text-muted hover:text-rasta-yellow rounded-lg hover:bg-elevated transition-colors cursor-pointer"
                          aria-label={`Create claim invite for ${p.name}`}
                          title={p.inviteActive ? 'New invite (replaces active one)' : 'Create claim invite'}
                        >
                          <KeyRound size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors cursor-pointer"
                        aria-label={`Edit profile ${p.name}`}
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      {!p.claimed && p.trackCount === 0 && (
                        <button
                          onClick={() => handleDelete(p)}
                          className="p-1.5 text-muted hover:text-rasta-red rounded-lg hover:bg-elevated transition-colors cursor-pointer"
                          aria-label={`Delete profile ${p.name}`}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminCard>
      )}

      {/* ========================== INVITE-DIALOG ========================== */}
      {inviteProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop — Klick schließt (Token-Phase: bewusst NUR über Close,
              damit der einmalige Klartext nicht versehentlich verloren geht) */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => (inviteResult ? undefined : closeInvite())}
          />
          <AdminCard framed frame="yellow" className="relative w-full max-w-md space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-foreground">
                {inviteResult ? 'Invite created' : `Invite for ${inviteProfile.name}`}
              </h3>
              <button
                onClick={closeInvite}
                className="p-1 text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors cursor-pointer"
                aria-label="Close invite dialog"
              >
                <X size={16} />
              </button>
            </div>

            {!inviteResult ? (
              <>
                <p className="text-sm text-secondary">
                  Creates a one-time claim link for this profile. A new invite replaces any
                  active one.
                </p>
                <div>
                  <label className="block text-sm text-muted mb-1">
                    Expires in days <span className="opacity-60">(1–90, default 14)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={inviteDays}
                    onChange={(e) => setInviteDays(e.target.value)}
                    className={cn(adminInputClass, 'w-28')}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <AdminButton variant="ghost" onClick={closeInvite}>
                    Cancel
                  </AdminButton>
                  <AdminButton onClick={handleCreateInvite} isLoading={creatingInvite}>
                    <KeyRound size={14} />
                    Create Invite
                  </AdminButton>
                </div>
              </>
            ) : (
              <>
                {/* Der Klartext-Token existiert NUR in dieser Response —
                    die DB hält den Hash. Einmal zu = weg. */}
                <div className="flex items-start gap-2 text-sm text-rasta-yellow">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p>Shown once — copy now. Closing this dialog discards the token.</p>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Claim URL (send this to the artist)</label>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-border font-mono text-xs text-rasta-green break-all">
                      {inviteResult.claimUrl}
                    </code>
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      onClick={() => handleCopy(inviteResult.claimUrl)}
                      aria-label="Copy claim URL"
                    >
                      <Copy size={14} />
                      Copy
                    </AdminButton>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Token</label>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-border font-mono text-xs text-secondary break-all">
                      {inviteResult.token}
                    </code>
                    <AdminButton
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(inviteResult.token)}
                      aria-label="Copy token"
                    >
                      <Copy size={14} />
                    </AdminButton>
                  </div>
                </div>
                <p className="text-xs text-muted">
                  Expires {new Date(inviteResult.expiresAt).toLocaleDateString('en-GB')}.
                </p>
                <div className="flex justify-end">
                  <AdminButton variant="ghost" onClick={closeInvite}>
                    Done — token copied
                  </AdminButton>
                </div>
              </>
            )}
          </AdminCard>
        </div>
      )}
    </div>
  )
}
