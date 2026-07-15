'use client';

/**
 * Boomy Pool — Admin-Seite
 *
 * Verwaltung der SUNO-Track-Release-Queue für den KI-Resident "Boomy".
 * - Wartende Boomy-Tracks anzeigen (isPublic=false)
 * - SUNO-Songs hochladen (MP3 → Track im Genre-Pool, isPublic=false)
 * - Manuell veröffentlichen ("Publish Now" → isPublic=true)
 * - Auto-Publish auslösen (POST /api/boomy/auto-publish)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot,
  Upload,
  Music2,
  Eye,
  Loader2,
  AlertCircle,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn, formatTime, formatFileSize, trackNameFromFile } from '@/lib/utils';
import { formatArtistDisplay } from '@/lib/track-display';
import BoomyPoolStatus from '@/components/admin/BoomyPoolStatus';
import { GENRES, AI_DISCLOSURE, AI_DISCLOSURE_SHORT } from '@/lib/constants';
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
} from '@/components/admin/ui';
import { useToast } from '@/components/providers/ToastProvider';

interface TrackData {
  id: string;
  title: string;
  slug: string;
  trackType?: string;
  duration: number;
  genre: string | null;
  bpm: number | null;
  status?: string;
  isPublic?: boolean;
  playCount: number;
  fileName?: string | null;
  fileSize?: number | null;
  aiDisclosure?: string | null;
  aiSource?: string | null;
  artist: { id: string; username: string; displayName: string | null };
  // v2.27: featuringArtist mitliefern, damit "feat." im Pool sichtbar wird
  // (Boomy-Hardphonk-Tracks haben Boomy als Feature auf 4Flow-Releases).
  featuringArtist?: { id: string; username: string; displayName: string | null } | null;
  streamUrl: string;
  createdAt?: string;
}

type UploadStatus = 'idle' | 'uploading' | 'creating' | 'success' | 'error';

export default function BoomyPoolPage() {
  const { toast } = useToast();
  const [poolTracks, setPoolTracks] = useState<TrackData[]>([]);
  const [publishedTracks, setPublishedTracks] = useState<TrackData[]>([]);
  const [loading, setLoading] = useState(true);
  const [boomyUserId, setBoomyUserId] = useState<string | null>(null);

  // Upload-Formular State
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadGenre, setUploadGenre] = useState<string>(GENRES[0]);
  const [uploadAiDisclosure, setUploadAiDisclosure] = useState<string>(
    AI_DISCLOSURE.AI_GENERATED
  );
  const [uploadCoverPrompt, setUploadCoverPrompt] = useState('');
  const [uploadBpm, setUploadBpm] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-Publish State (Erfolg/Fehler laufen über Toasts)
  const [autoPublishing, setAutoPublishing] = useState(false);

  // Publishing State für einzelne Tracks
  const [publishingId, setPublishingId] = useState<string | null>(null);

  // === Boomy-User-ID laden ===
  // Gibt die ID auch zurück, damit handleUpload sie bei Bedarf nachladen
  // kann — vorher blieb ein einmalig fehlgeschlagener Initial-Load bis zum
  // Seiten-Reload hängen und jeder Upload lief in "Boomy user not found".
  const loadBoomyUser = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/users');
      const json = await res.json();
      if (json.success && json.data) {
        const boomy = json.data.find(
          (u: { username: string }) => u.username === 'boomy'
        );
        if (boomy) {
          setBoomyUserId(boomy.id);
          return boomy.id;
        }
      }
    } catch (err) {
      console.error('Boomy-User laden Fehler:', err);
    }
    return null;
  }, []);

  // === Tracks laden und nach Status filtern ===
  const loadTracks = useCallback(async () => {
    try {
      const res = await fetch('/api/tracks?pageSize=200');
      const json = await res.json();
      if (json.success && json.data) {
        const all = json.data as TrackData[];
        // Wartende Boomy-Tracks: noch nicht öffentlich
        setPoolTracks(
          all.filter((t) => !t.isPublic && t.artist?.username === 'boomy')
        );
        // Öffentliche Boomy-Tracks
        setPublishedTracks(
          all.filter((t) => t.isPublic && t.artist?.username === 'boomy')
        );
      }
    } catch (err) {
      console.error('Tracks laden Fehler:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoomyUser();
    loadTracks();
  }, [loadBoomyUser, loadTracks]);

  // === MP3-Upload für SUNO-Track ===
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handleUpload(file);
      e.target.value = '';
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleUpload = async (file: File) => {
    // Retry statt harter Abbruch: schlug der Initial-Load fehl (transienter
    // Netz-Fehler), holen wir die ID hier einfach nach.
    const artistId = boomyUserId ?? (await loadBoomyUser());
    if (!artistId) {
      toast({
        type: 'error',
        message: 'Boomy user not found. Create a user "boomy" first.',
      });
      return;
    }

    setUploadStatus('uploading');
    setUploadMessage(`Uploading "${file.name}"...`);

    try {
      // 1. Datei hochladen
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadJson = await uploadRes.json();

      if (!uploadJson.success) {
        throw new Error(uploadJson.error || 'Upload failed');
      }

      setUploadStatus('creating');
      setUploadMessage('Creating pool track entry...');

      // 2. Track in der DB erstellen — landet automatisch im Genre-Pool,
      // isPublic=false (wartet auf Release). Cover-Prompt-Hint geht vorerst in
      // description, bis kbk-mcp die Cover-Bridge nutzt.
      const title = uploadTitle.trim() || trackNameFromFile(file.name);
      const description = [
        uploadDescription.trim(),
        uploadCoverPrompt.trim() ? `[cover-prompt: ${uploadCoverPrompt.trim()}]` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const trackRes = await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          trackType: 'LOCAL',
          aiDisclosure: uploadAiDisclosure,
          aiSource: uploadAiDisclosure === AI_DISCLOSURE.HUMAN ? null : 'suno',
          artistId,
          fileName: uploadJson.data.fileName,
          filePath: uploadJson.data.filePath,
          fileSize: uploadJson.data.fileSize,
          duration: 0,
          genre: uploadGenre,
          bpm: uploadBpm ? parseInt(uploadBpm, 10) : undefined,
          description: description || undefined,
        }),
      });
      const trackJson = await trackRes.json();

      if (!trackJson.success) {
        throw new Error(trackJson.error || 'Track creation failed');
      }

      // Erfolg/Fehler als Toast melden, Banner zeigt nur noch Fortschritt
      setUploadStatus('idle');
      setUploadMessage('');
      toast({
        type: 'success',
        message: `"${title}" → ${uploadGenre} · ${AI_DISCLOSURE_SHORT[uploadAiDisclosure]}`,
      });

      // Formular zurücksetzen (Genre+aiContent stehenlassen, häufig gleiche Wahl)
      setUploadTitle('');
      setUploadCoverPrompt('');
      setUploadBpm('');
      setUploadDescription('');
      setShowUploadForm(false);

      // Tracks neu laden
      loadTracks();
    } catch (err) {
      setUploadStatus('idle');
      setUploadMessage('');
      toast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Something went wrong.',
      });
    }
  };

  // === Track manuell veröffentlichen ===
  const publishTrack = useCallback(
    async (id: string) => {
      setPublishingId(id);
      try {
        const res = await fetch(`/api/tracks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: true }),
        });
        const json = await res.json();
        if (json.success) {
          toast({ type: 'success', message: 'Track published.' });
          loadTracks();
        } else {
          toast({
            type: 'error',
            message: json.error || 'Something went wrong.',
          });
        }
      } catch (err) {
        toast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Something went wrong.',
        });
      } finally {
        setPublishingId(null);
      }
    },
    [loadTracks, toast]
  );

  // === Auto-Publish auslösen ===
  const triggerAutoPublish = useCallback(async () => {
    setAutoPublishing(true);

    try {
      const res = await fetch('/api/boomy/auto-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();

      if (json.success) {
        toast({
          type: 'success',
          message: json.message || 'Auto-publish succeeded.',
        });
        loadTracks();
      } else {
        toast({ type: 'error', message: json.error || 'Auto-publish failed.' });
      }
    } catch (err) {
      toast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Something went wrong.',
      });
    } finally {
      setAutoPublishing(false);
    }
  }, [loadTracks, toast]);

  // === Status-Badge — Live (öffentlich) vs Pool (wartet auf Release) ===
  const StatusBadge = ({ isPublic }: { isPublic?: boolean }) => (
    <span
      className={cn(
        'px-2 py-0.5 text-xs font-medium rounded-full',
        isPublic
          ? 'bg-rasta-green/10 text-rasta-green'
          : 'bg-violet-400/10 text-violet-400'
      )}
    >
      {isPublic ? 'Live' : 'Pool'}
    </span>
  );

  return (
    <div>
      {/* Header */}
      <AdminPageHeader
        kickerTag="/B/"
        kicker="AI RESIDENT"
        title="BOOMY POOL"
        description="Boomy releases one AI track every 2 days from the release queue."
        actions={
          <>
            {/* Auto-Publish Button — Boomy-Lila als Akzent (Bot-Kontext) */}
            <AdminButton
              onClick={triggerAutoPublish}
              disabled={poolTracks.length === 0}
              isLoading={autoPublishing}
              className="text-violet-400"
            >
              {!autoPublishing && <Zap size={16} />}
              Auto-Publish Now
            </AdminButton>
            {/* Upload Button */}
            <AdminButton onClick={() => setShowUploadForm(!showUploadForm)}>
              <Upload size={16} />
              Add SUNO Track
              {showUploadForm ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </AdminButton>
          </>
        }
      />

      {/* Upload-Fortschritts-Banner (Erfolg/Fehler laufen über Toasts) */}
      {(uploadStatus === 'uploading' || uploadStatus === 'creating') && (
        <div className="mb-6 p-4 rounded-lg flex items-center gap-3 text-sm bg-violet-400/10 border border-violet-400/20 text-violet-400">
          <Loader2 size={18} className="animate-spin" />
          {uploadMessage}
        </div>
      )}

      {/* Upload-Formular (aufklappbar) */}
      {showUploadForm && (
        <AdminCard padding="sm" className="mb-6">
          <h3 className="font-heading font-semibold text-lg mb-3 text-violet-400">
            Add Boomy Track
          </h3>
          <div className="space-y-3">
            {/* Titel */}
            <input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Title (optional, derived from filename)"
              className={cn(adminInputClass, 'w-full')}
            />
            {/* Genre Selector — 4 Buttons */}
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">
                Genre
              </label>
              <div className="grid grid-cols-2 gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setUploadGenre(g)}
                    className={cn(
                      'px-3 py-2 text-sm font-semibold rounded-lg border transition-colors cursor-pointer',
                      uploadGenre === g
                        ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                        : 'border-border bg-kbk-dark-800 text-muted hover:border-violet-500/40'
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            {/* AI-Anteil Selector — 3 Buttons */}
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">
                AI Content
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.values(AI_DISCLOSURE).map((ai) => (
                  <button
                    key={ai}
                    type="button"
                    onClick={() => setUploadAiDisclosure(ai)}
                    className={cn(
                      'px-3 py-2 text-sm font-semibold rounded-lg border transition-colors cursor-pointer',
                      uploadAiDisclosure === ai
                        ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                        : 'border-border bg-kbk-dark-800 text-muted hover:border-violet-500/40'
                    )}
                  >
                    {AI_DISCLOSURE_SHORT[ai]}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted mt-1">
                Only AI tracks are released by Boomy automatically. Hybrid = &quot;4Flow feat. Boomy&quot;, Human = direct uploads.
              </p>
            </div>
            {/* Cover-Prompt-Hint + BPM */}
            <div className="flex gap-3">
              <input
                value={uploadCoverPrompt}
                onChange={(e) => setUploadCoverPrompt(e.target.value)}
                placeholder="Cover prompt hint (optional, e.g. 'neon city, foggy night')"
                className={cn(adminInputClass, 'flex-1 min-w-0')}
              />
              <input
                value={uploadBpm}
                onChange={(e) => setUploadBpm(e.target.value)}
                placeholder="BPM"
                type="number"
                className={cn(adminInputClass, 'w-24')}
              />
            </div>
            {/* Beschreibung */}
            <textarea
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className={cn(adminInputClass, 'w-full resize-none')}
            />
            {/* Datei-Auswahl + Absenden */}
            <div className="flex gap-2">
              <AdminButton
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                isLoading={
                  uploadStatus === 'uploading' || uploadStatus === 'creating'
                }
                className="text-violet-400"
              >
                {uploadStatus !== 'uploading' && uploadStatus !== 'creating' && (
                  <Upload size={16} />
                )}
                Select MP3 & Upload
              </AdminButton>
              <AdminButton
                variant="ghost"
                onClick={() => setShowUploadForm(false)}
              >
                Cancel
              </AdminButton>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,audio/mpeg"
            onChange={handleFileSelect}
            className="hidden"
          />
        </AdminCard>
      )}

      {/* Boomy-User Warnung */}
      {!loading && !boomyUserId && (
        <AdminCard
          framed
          frame="yellow"
          padding="sm"
          className="mb-6 flex items-center gap-3 text-sm text-rasta-yellow"
        >
          <AlertCircle size={18} className="shrink-0" />
          No user &quot;boomy&quot; found. Create a user with the username &quot;boomy&quot; first.
        </AdminCard>
      )}

      {/* Pool-Status-Widget — full variant */}
      <BoomyPoolStatus variant="full" />

      {/* Pool-Track-Liste */}
      <AdminCard padding="none" className="overflow-hidden mb-8">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            <Clock size={18} className="text-violet-400" />
            Pool
            <span className="text-sm font-normal text-muted">
              ({poolTracks.length} tracks)
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-violet-400" size={24} />
          </div>
        ) : poolTracks.length === 0 ? (
          <div className="text-center py-12">
            <Bot size={36} className="mx-auto text-muted mb-3" />
            <p className="text-muted">No tracks in the pool.</p>
            <p className="text-sm text-muted/70 mt-1">
              Upload SUNO tracks to fill the pool!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <div className="min-w-[640px] divide-y divide-border">
            {/* Tabellen-Header */}
            <div className="grid grid-cols-[1fr_80px_80px_80px_100px_100px] gap-4 px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
              <span>Track</span>
              <span>Status</span>
              <span>Duration</span>
              <span>BPM</span>
              <span>Size</span>
              <span className="text-right">Actions</span>
            </div>

            {/* Pool-Tracks */}
            {poolTracks.map((track) => (
              <div
                key={track.id}
                className="grid grid-cols-[1fr_80px_80px_80px_100px_100px] gap-4 px-4 py-3 items-center hover:bg-elevated/50 transition-colors"
              >
                {/* Titel + Metadaten */}
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    <span className="inline-block mr-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-violet-400/10 text-violet-400 rounded align-middle">
                      SUNO
                    </span>
                    {track.title}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {formatArtistDisplay(track)}
                    {track.genre && ` · ${track.genre}`}
                  </p>
                </div>

                {/* Status */}
                <div>
                  <StatusBadge isPublic={track.isPublic} />
                </div>

                {/* Dauer */}
                <span className="text-sm text-muted tabular-nums">
                  {track.duration > 0 ? formatTime(track.duration) : '--:--'}
                </span>

                {/* BPM */}
                <span className="text-sm text-muted tabular-nums">
                  {track.bpm || '--'}
                </span>

                {/* Dateigröße */}
                <span className="text-sm text-muted">
                  {track.fileSize ? formatFileSize(track.fileSize) : '--'}
                </span>

                {/* Aktionen */}
                <div className="flex items-center justify-end">
                  <AdminButton
                    size="sm"
                    variant="secondary"
                    onClick={() => publishTrack(track.id)}
                    isLoading={publishingId === track.id}
                    className="text-violet-400"
                    title="Publish Now"
                  >
                    {publishingId !== track.id && <Eye size={12} />}
                    Publish
                  </AdminButton>
                </div>
              </div>
            ))}
          </div>
          </div>
        )}
      </AdminCard>

      {/* Veröffentlichte Boomy-Tracks */}
      <AdminCard padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            <Music2 size={18} className="text-rasta-green" />
            Published Boomy Tracks
            <span className="text-sm font-normal text-muted">
              ({publishedTracks.length} tracks)
            </span>
          </h2>
        </div>

        {publishedTracks.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted text-sm">
              No published Boomy tracks yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <div className="min-w-[560px] divide-y divide-border">
            {/* Tabellen-Header */}
            <div className="grid grid-cols-[1fr_80px_80px_80px_100px] gap-4 px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
              <span>Track</span>
              <span>Status</span>
              <span>Duration</span>
              <span>Plays</span>
              <span>Size</span>
            </div>

            {/* Veröffentlichte Tracks */}
            {publishedTracks.map((track) => (
              <div
                key={track.id}
                className="grid grid-cols-[1fr_80px_80px_80px_100px] gap-4 px-4 py-3 items-center hover:bg-elevated/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    <span className="inline-block mr-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-violet-400/10 text-violet-400 rounded align-middle">
                      AI
                    </span>
                    {track.title}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {formatArtistDisplay(track)}
                    {track.genre && ` · ${track.genre}`}
                  </p>
                </div>

                <div>
                  <StatusBadge isPublic={track.isPublic} />
                </div>

                <span className="text-sm text-muted tabular-nums">
                  {track.duration > 0 ? formatTime(track.duration) : '--:--'}
                </span>

                <span className="text-sm text-muted tabular-nums">
                  {track.playCount}
                </span>

                <span className="text-sm text-muted">
                  {track.fileSize ? formatFileSize(track.fileSize) : '--'}
                </span>
              </div>
            ))}
          </div>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
