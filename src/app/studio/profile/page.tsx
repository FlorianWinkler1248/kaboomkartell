'use client'

/**
 * Studio — My Profile (ADR-041 Welle 3)
 *
 * Formular für die editierbaren Profil-Felder: bio, avatarUrl/headerUrl
 * (Bild-Upload via /api/upload Bild-Zweig ODER direktes URL-Feld) und die
 * vier Social-Links. name + slug sind read-only (Vergabe nur durch Flow).
 * Save → PUT /api/studio/profile + Toast (Muster Admin-Missions-Cockpit).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Upload, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/providers/ToastProvider'
import { SafeImg } from '@/components/ui/SafeImg'
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
} from '@/components/admin/ui'
import type { StudioProfile } from '@/components/studio/studio-types'

interface ProfileFormState {
  bio: string
  avatarUrl: string
  headerUrl: string
  socialSoundcloud: string
  socialInstagram: string
  socialTelegram: string
  socialWebsite: string
}

const EMPTY_FORM: ProfileFormState = {
  bio: '',
  avatarUrl: '',
  headerUrl: '',
  socialSoundcloud: '',
  socialInstagram: '',
  socialTelegram: '',
  socialWebsite: '',
}

/**
 * Bild-Feld mit Upload-Button + URL-Text-Feld.
 * Upload läuft über den bestehenden /api/upload-Bild-Zweig (multipart, Feld
 * "file") — Response-Shape: data.filePath (relativer Pfad, direkt nutzbar).
 */
function ImageField({
  label,
  value,
  onChange,
  previewShape,
}: {
  label: string
  value: string
  onChange: (url: string) => void
  previewShape: 'square' | 'wide'
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (json.success) {
        onChange(json.data.filePath)
        toast({ message: `${label} uploaded.`, type: 'success' })
      } else {
        toast({ message: json.error || 'Upload failed.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error during upload.', type: 'error' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <label className="block text-sm text-muted mb-1">{label}</label>
      <div className="flex items-start gap-3">
        {/* Vorschau — SafeImg fängt kaputte URLs ab */}
        <div
          className={cn(
            'shrink-0 rounded-lg overflow-hidden bg-kbk-dark-800 border border-border',
            previewShape === 'square' ? 'w-16 h-16' : 'w-28 h-16'
          )}
        >
          <SafeImg
            src={value || null}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            fallback={
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon size={20} className="text-muted" />
              </div>
            }
          />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(adminInputClass, 'w-full')}
            placeholder="/uploads/covers/... or https://..."
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
          <AdminButton
            size="sm"
            variant="secondary"
            type="button"
            isLoading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} />
            Upload image
          </AdminButton>
        </div>
      </div>
    </div>
  )
}

export default function StudioProfilePage() {
  const { toast } = useToast()
  const [profile, setProfile] = useState<StudioProfile | null>(null)
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/studio/profile')
      const json = await res.json()
      if (json.success) {
        const p: StudioProfile = json.data.profile
        setProfile(p)
        setForm({
          bio: p.bio ?? '',
          avatarUrl: p.avatarUrl ?? '',
          headerUrl: p.headerUrl ?? '',
          socialSoundcloud: p.socialSoundcloud ?? '',
          socialInstagram: p.socialInstagram ?? '',
          socialTelegram: p.socialTelegram ?? '',
          socialWebsite: p.socialWebsite ?? '',
        })
      } else {
        toast({ message: json.error || 'Error loading profile.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const handleSave = async () => {
    setSaving(true)
    try {
      // Leere Strings als null senden — so kann ein Feld auch geräumt werden
      const nullable = (v: string) => v.trim() || null
      const res = await fetch('/api/studio/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bio: nullable(form.bio),
          avatarUrl: nullable(form.avatarUrl),
          headerUrl: nullable(form.headerUrl),
          socialSoundcloud: nullable(form.socialSoundcloud),
          socialInstagram: nullable(form.socialInstagram),
          socialTelegram: nullable(form.socialTelegram),
          socialWebsite: nullable(form.socialWebsite),
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast({ message: 'Profile saved.', type: 'success' })
        if (json.data?.profile) setProfile(json.data.profile)
      } else {
        toast({ message: json.error || 'Error saving profile.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const socialFields: Array<{ key: keyof ProfileFormState; label: string; placeholder: string }> = [
    { key: 'socialSoundcloud', label: 'SoundCloud', placeholder: 'https://soundcloud.com/...' },
    { key: 'socialInstagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
    { key: 'socialTelegram', label: 'Telegram', placeholder: 'https://t.me/...' },
    { key: 'socialWebsite', label: 'Website', placeholder: 'https://...' },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        kickerTag="/S/"
        kicker="ARTIST STUDIO"
        title="MY PROFILE"
        description="What the pack sees on your public artist page."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-muted" size={32} />
        </div>
      ) : !profile ? (
        <AdminCard className="text-center py-10 text-muted text-sm">
          No artist profile linked to your account yet. Ask Flow.
        </AdminCard>
      ) : (
        <>
          {/* Read-only-Identität — Vergabe nur durch Flow */}
          <AdminCard className="space-y-4">
            <h3 className="font-semibold text-foreground">Identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-muted mb-1">Name</label>
                <input
                  type="text"
                  value={profile.name}
                  readOnly
                  disabled
                  className={cn(adminInputClass, 'w-full opacity-60 cursor-not-allowed')}
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Slug</label>
                <input
                  type="text"
                  value={profile.slug}
                  readOnly
                  disabled
                  className={cn(adminInputClass, 'w-full opacity-60 cursor-not-allowed')}
                />
              </div>
            </div>
            <p className="text-xs text-muted">
              Name and slug are fixed — if you need a change, ask Flow.
            </p>
          </AdminCard>

          {/* Editierbare Felder */}
          <AdminCard className="space-y-4">
            <h3 className="font-semibold text-foreground">Profile</h3>
            <div>
              <label className="block text-sm text-muted mb-1">
                Bio <span className="opacity-60">(max 1000 characters)</span>
              </label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                className={cn(adminInputClass, 'w-full min-h-[120px]')}
                maxLength={1000}
                placeholder="Tell the pack who you are and what you make."
              />
              <div className="text-xs text-muted text-right mt-1 font-mono">
                {form.bio.length}/1000
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ImageField
                label="Avatar"
                value={form.avatarUrl}
                onChange={(url) => setForm((prev) => ({ ...prev, avatarUrl: url }))}
                previewShape="square"
              />
              <ImageField
                label="Header image"
                value={form.headerUrl}
                onChange={(url) => setForm((prev) => ({ ...prev, headerUrl: url }))}
                previewShape="wide"
              />
            </div>
          </AdminCard>

          {/* Social-Links */}
          <AdminCard className="space-y-4">
            <h3 className="font-semibold text-foreground">Links</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {socialFields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm text-muted mb-1">{field.label}</label>
                  <input
                    type="url"
                    value={form[field.key]}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    className={cn(adminInputClass, 'w-full')}
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
            </div>
          </AdminCard>

          <AdminButton onClick={handleSave} isLoading={saving}>
            Save Profile
          </AdminButton>
        </>
      )}
    </div>
  )
}
