'use client'

/**
 * Studio — Upload (ADR-041 Welle 3)
 *
 * Wizard in einer AdminCard, 3 Schritte in EINEM Formular-Flow:
 *   (1) MP3-Upload via bestehendem POST /api/upload (multipart, Feld "file")
 *   (2) Metadaten: title/genre/bpm/description/aiDisclosure(Pflicht)/aiSource/
 *       ISRC/Label/Message an Flow
 *   (3) Cover: Bild-Upload ODER Sprite-Hinweis (Sprite-Generierung erst nach
 *       dem Submit auf der Tracks-Seite verfügbar, max 5/h)
 * Am Ende: POST /api/studio/tracks → Redirect /studio/tracks + Toast.
 *
 * 403-Fall (kein Upload-Recht: Badge artist:upload + 2FA/T2 fehlt) → statt
 * Wizard eine Hinweis-Card mit Link auf /settings/security.
 */

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileAudio, Upload, ImageIcon, Sparkles, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GENRES, AI_DISCLOSURE_LABELS } from '@/lib/constants'
import { useToast } from '@/components/providers/ToastProvider'
import { SafeImg } from '@/components/ui/SafeImg'
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
  adminSelectClass,
} from '@/components/admin/ui'

// Upload-Ergebnis des /api/upload-Audio-Zweigs (Response-Shape der Route)
interface UploadedFile {
  fileName: string
  filePath: string
  fileSize: number
}

const AI_DISCLOSURE_VALUES = ['human', 'ai_assisted', 'ai_generated'] as const

export default function StudioUploadPage() {
  const { toast } = useToast()
  const router = useRouter()

  // 403 vom Audio-Upload oder Track-Submit → Wizard durch Hinweis-Card ersetzen
  const [noUploadRight, setNoUploadRight] = useState(false)

  // Schritt 1 — Audio
  const audioRef = useRef<HTMLInputElement>(null)
  const [audioFile, setAudioFile] = useState<UploadedFile | null>(null)
  const [uploadingAudio, setUploadingAudio] = useState(false)

  // Schritt 2 — Metadaten
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState<string>(GENRES[0])
  const [bpm, setBpm] = useState('')
  const [description, setDescription] = useState('')
  const [aiDisclosure, setAiDisclosure] = useState('')
  const [aiSource, setAiSource] = useState('')
  const [isrc, setIsrc] = useState('')
  const [label, setLabel] = useState('')
  const [message, setMessage] = useState('')

  // Schritt 3 — Cover
  const coverRef = useRef<HTMLInputElement>(null)
  const [coverMode, setCoverMode] = useState<'upload' | 'sprite'>('sprite')
  const [coverUrl, setCoverUrl] = useState('')
  const [uploadingCover, setUploadingCover] = useState(false)

  const [submitting, setSubmitting] = useState(false)

  // === Schritt 1: MP3 hochladen ===
  const handleAudioFile = async (file: File) => {
    setUploadingAudio(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (res.status === 403) {
        // Kein Upload-Recht — der Audio-Zweig verlangt Badge artist:upload + 2FA
        setNoUploadRight(true)
        return
      }
      const json = await res.json()
      if (json.success) {
        setAudioFile({
          fileName: json.data.fileName,
          filePath: json.data.filePath,
          fileSize: json.data.fileSize,
        })
        toast({ message: 'Audio uploaded.', type: 'success' })
      } else {
        toast({ message: json.error || 'Upload failed.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error during upload.', type: 'error' })
    } finally {
      setUploadingAudio(false)
      if (audioRef.current) audioRef.current.value = ''
    }
  }

  // === Schritt 3: Cover-Bild hochladen ===
  const handleCoverFile = async (file: File) => {
    setUploadingCover(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (json.success) {
        setCoverUrl(json.data.filePath)
        toast({ message: 'Cover uploaded.', type: 'success' })
      } else {
        toast({ message: json.error || 'Cover upload failed.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error during upload.', type: 'error' })
    } finally {
      setUploadingCover(false)
      if (coverRef.current) coverRef.current.value = ''
    }
  }

  // === Submit: Track + Submission anlegen ===
  const handleSubmit = async () => {
    if (!audioFile) {
      toast({ message: 'Upload your MP3 first.', type: 'error' })
      return
    }
    if (!title.trim()) {
      toast({ message: 'Title is required.', type: 'error' })
      return
    }
    if (!aiDisclosure) {
      toast({ message: 'AI disclosure is required — be honest with the pack.', type: 'error' })
      return
    }
    setSubmitting(true)
    try {
      const bpmNumber = bpm.trim() === '' ? null : Number(bpm)
      const payload: Record<string, unknown> = {
        title: title.trim(),
        genre,
        aiDisclosure,
        fileName: audioFile.fileName,
        filePath: audioFile.filePath,
        fileSize: audioFile.fileSize,
      }
      // Optionale Felder nur senden, wenn gefüllt
      if (Number.isFinite(bpmNumber as number) && bpmNumber !== null) payload.bpm = bpmNumber
      if (description.trim()) payload.description = description
      if (aiDisclosure !== 'human' && aiSource.trim()) payload.aiSource = aiSource.trim()
      if (isrc.trim()) payload.isrc = isrc.trim()
      if (label.trim()) payload.label = label.trim()
      if (message.trim()) payload.message = message
      if (coverMode === 'upload' && coverUrl.trim()) payload.coverUrl = coverUrl.trim()

      const res = await fetch('/api/studio/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (res.status === 403) {
        setNoUploadRight(true)
        if (json?.error) toast({ message: json.error, type: 'error' })
        return
      }
      if (json?.success) {
        toast({ message: 'Submitted for review.', type: 'success' })
        router.push('/studio/tracks')
      } else {
        toast({ message: json?.error || 'Error submitting track.', type: 'error' })
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  // Schritt-Nummern-Kopf im Mono-Stil
  const stepHeader = (num: string, label: string) => (
    <div className="flex items-center gap-2 border-b border-border pb-2">
      <span className="font-mono text-[11px] tracking-[0.2em] text-rasta-green">/{num}/</span>
      <span className="font-semibold text-foreground text-sm uppercase tracking-wider">{label}</span>
    </div>
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        kickerTag="/S/"
        kicker="ARTIST STUDIO"
        title="UPLOAD"
        description="Submit a track for review. Flow checks every drop before it goes live."
      />

      {noUploadRight ? (
        /* 403-Fall: Upload-Recht fehlt (Badge artist:upload + 2FA/T2) */
        <AdminCard framed frame="yellow" className="space-y-3 max-w-xl">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <ShieldAlert size={18} />
            Upload locked
          </div>
          <p className="text-sm text-secondary">
            Uploads need the artist:upload badge + 2FA. Ask Flow.
          </p>
          <p className="text-sm text-muted">
            You can enable two-factor authentication in your{' '}
            <Link href="/settings/security" className="text-rasta-green hover:underline">
              security settings
            </Link>
            .
          </p>
        </AdminCard>
      ) : (
        <AdminCard className="space-y-8 max-w-2xl">
          {/* ============ Schritt 1: Audio ============ */}
          <section className="space-y-4">
            {stepHeader('01', 'Audio file')}
            <input
              ref={audioRef}
              type="file"
              accept="audio/mpeg,.mp3"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleAudioFile(file)
              }}
            />
            {audioFile ? (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-rasta-green/10 border border-rasta-green/30 text-sm text-rasta-green">
                  <FileAudio size={16} />
                  <span className="font-mono text-xs break-all">{audioFile.fileName}</span>
                  <span className="text-xs opacity-70">
                    ({(audioFile.fileSize / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </div>
                <AdminButton
                  size="sm"
                  variant="ghost"
                  onClick={() => audioRef.current?.click()}
                  isLoading={uploadingAudio}
                >
                  Replace file
                </AdminButton>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => audioRef.current?.click()}
                disabled={uploadingAudio}
                className={cn(
                  'w-full min-h-[96px] rounded-lg border-2 border-dashed border-border',
                  'flex flex-col items-center justify-center gap-2 text-muted',
                  'hover:border-rasta-green/50 hover:text-secondary transition-colors cursor-pointer',
                  uploadingAudio && 'opacity-60 cursor-wait'
                )}
              >
                <FileAudio size={24} />
                <span className="text-sm">
                  {uploadingAudio ? 'Uploading...' : 'Click to choose your MP3'}
                </span>
              </button>
            )}
          </section>

          {/* ============ Schritt 2: Metadaten ============ */}
          <section className="space-y-4">
            {stepHeader('02', 'Track details')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm text-muted mb-1">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={cn(adminInputClass, 'w-full')}
                  placeholder="Track title"
                  maxLength={120}
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Genre *</label>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
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
                  value={bpm}
                  onChange={(e) => setBpm(e.target.value)}
                  className={cn(adminInputClass, 'w-full')}
                  placeholder="140"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">AI disclosure *</label>
                <select
                  value={aiDisclosure}
                  onChange={(e) => setAiDisclosure(e.target.value)}
                  className={cn(adminSelectClass, 'w-full')}
                >
                  <option value="" disabled>
                    Select...
                  </option>
                  {AI_DISCLOSURE_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {AI_DISCLOSURE_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>
              {aiDisclosure !== '' && aiDisclosure !== 'human' && (
                <div>
                  <label className="block text-sm text-muted mb-1">AI source</label>
                  <input
                    type="text"
                    value={aiSource}
                    onChange={(e) => setAiSource(e.target.value)}
                    className={cn(adminInputClass, 'w-full')}
                    placeholder="suno / udio / ..."
                    maxLength={60}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-muted mb-1">
                  ISRC <span className="opacity-60">(CCXXXYYNNNNN)</span>
                </label>
                <input
                  type="text"
                  value={isrc}
                  onChange={(e) => setIsrc(e.target.value)}
                  className={cn(adminInputClass, 'w-full font-mono')}
                  placeholder="DEABC2600001"
                  maxLength={15}
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className={cn(adminInputClass, 'w-full')}
                  placeholder="Label name"
                  maxLength={120}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-muted mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={cn(adminInputClass, 'w-full min-h-[70px]')}
                  placeholder="What's the story behind this track?"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-muted mb-1">Message to Flow</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={cn(adminInputClass, 'w-full min-h-[70px]')}
                  placeholder="Anything Flow should know for the review?"
                />
              </div>
            </div>
          </section>

          {/* ============ Schritt 3: Cover ============ */}
          <section className="space-y-4">
            {stepHeader('03', 'Cover')}
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer min-h-[44px]">
                <input
                  type="radio"
                  name="coverMode"
                  checked={coverMode === 'sprite'}
                  onChange={() => setCoverMode('sprite')}
                  className="accent-rasta-green"
                />
                <Sparkles size={14} className="text-rasta-green" />
                Generate Sprite
              </label>
              {coverMode === 'sprite' && (
                <p className="text-xs text-muted ml-6 -mt-1">
                  Sprite generation available after submitting — use the sprite button on My
                  Tracks (max 5 per hour).
                </p>
              )}
              <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer min-h-[44px]">
                <input
                  type="radio"
                  name="coverMode"
                  checked={coverMode === 'upload'}
                  onChange={() => setCoverMode('upload')}
                  className="accent-rasta-green"
                />
                <ImageIcon size={14} className="text-rasta-green" />
                Upload image
              </label>
              {coverMode === 'upload' && (
                <div className="ml-6 flex items-center gap-3">
                  <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-kbk-dark-800 border border-border">
                    <SafeImg
                      src={coverUrl || null}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      fallback={
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={20} className="text-muted" />
                        </div>
                      }
                    />
                  </div>
                  <input
                    ref={coverRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleCoverFile(file)
                    }}
                  />
                  <AdminButton
                    size="sm"
                    variant="secondary"
                    type="button"
                    isLoading={uploadingCover}
                    onClick={() => coverRef.current?.click()}
                  >
                    <Upload size={14} />
                    {coverUrl ? 'Replace image' : 'Choose image'}
                  </AdminButton>
                </div>
              )}
            </div>
          </section>

          {/* ============ Submit ============ */}
          <div className="pt-2 border-t border-border">
            <AdminButton
              onClick={handleSubmit}
              isLoading={submitting}
              disabled={submitting || !audioFile || !title.trim() || !aiDisclosure}
            >
              Submit for review
            </AdminButton>
            <p className="text-xs text-muted mt-2">
              Your track stays private until Flow approves and publishes it.
            </p>
          </div>
        </AdminCard>
      )}
    </div>
  )
}
