'use client';

/**
 * Admin Track-Verwaltung
 *
 * Die Seite selbst bleibt eine Client-Component, weil Upload, SoundCloud-Formular
 * und die Tracks-Liste allesamt Interaktivitaet brauchen. Der teure Teil
 * (Pagination, Filter, Suche, Action-Menues) ist in AdminTracksList ausgelagert.
 *
 * Features:
 *   - MP3-Upload per Datei-Dialog
 *   - SoundCloud-Track hinzufügen
 *   - Track-Liste mit Pagination, Genre-/Status-Filter und Suche
 *   - Drei-Punkte-Menue pro Track (Edit / Publish-Toggle / Archive)
 */

import { Suspense, useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Loader2,
  Upload,
} from 'lucide-react';
import { cn, trackNameFromFile } from '@/lib/utils';
import { GENRES } from '@/lib/constants';
import {
  AdminButton,
  AdminCard,
  AdminPageHeader,
  adminInputClass,
  adminSelectClass,
} from '@/components/admin/ui';
import AdminTracksList, {
  type AdminTrack,
} from '@/components/admin/tracks/AdminTracksList';
import EditTrackModal from '@/components/admin/tracks/EditTrackModal';

type UploadStatus = 'idle' | 'uploading' | 'creating' | 'success' | 'error';

export default function AdminTracksPage() {
  return (
    // Suspense-Grenze für useSearchParams (Next.js 16 Requirement)
    <Suspense fallback={<PageFallback />}>
      <AdminTracksPageInner />
    </Suspense>
  );
}

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-rasta-green" size={24} />
    </div>
  );
}

function AdminTracksPageInner() {
  // Reload-Token: wird hochgezaehlt, wenn die Liste sich aktualisieren soll
  // (nach Upload, nach Speichern im Edit-Modal, nach SoundCloud-Add).
  const [reloadToken, setReloadToken] = useState(0);
  const triggerReload = useCallback(() => setReloadToken((x) => x + 1), []);

  // Upload-State
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Genre-Pflicht beim direkten MP3-Upload. Ohne Genre kein Upload — sonst
  // landet der Track in keinem der 4 Genre-Pools.
  const [uploadGenre, setUploadGenre] = useState<string>('');

  // SoundCloud-State
  const [showSoundcloudForm, setShowSoundcloudForm] = useState(false);
  const [scUrl, setScUrl] = useState('');
  const [scTitle, setScTitle] = useState('');
  const [scGenre, setScGenre] = useState('');
  const [scStatus, setScStatus] = useState<UploadStatus>('idle');
  const [scMessage, setScMessage] = useState('');

  // Edit-Modal-State
  const [editingTrack, setEditingTrack] = useState<AdminTrack | null>(null);

  // === Upload ===
  const handleUpload = useCallback(
    async (file: File) => {
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
        setUploadMessage('Creating track entry...');

        // 2. Track in DB anlegen — Genre wird vom Upload-Form-Selector gesetzt.
        const title = trackNameFromFile(file.name);
        const trackRes = await fetch('/api/tracks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            genre: uploadGenre,
            fileName: uploadJson.data.fileName,
            filePath: uploadJson.data.filePath,
            fileSize: uploadJson.data.fileSize,
            duration: 0,
          }),
        });
        const trackJson = await trackRes.json();

        if (!trackJson.success) {
          throw new Error(trackJson.error || 'Track creation failed');
        }

        setUploadStatus('success');
        setUploadMessage(`"${title}" uploaded successfully!`);
        triggerReload();

        setTimeout(() => {
          setUploadStatus('idle');
          setUploadMessage('');
        }, 3000);
      } catch (err) {
        setUploadStatus('error');
        setUploadMessage(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [triggerReload, uploadGenre]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Genre-Pflicht: ohne Genre kein Upload (Flow's Vorgabe).
      if (!uploadGenre) {
        setUploadStatus('error');
        setUploadMessage('Choose a genre first.');
        e.target.value = '';
        setTimeout(() => {
          setUploadStatus('idle');
          setUploadMessage('');
        }, 3000);
        return;
      }
      handleUpload(file);
      e.target.value = '';
    },
    [handleUpload, uploadGenre]
  );

  // === SoundCloud-Track hinzufügen ===
  const handleSoundcloudAdd = useCallback(async () => {
    if (!scUrl.trim()) return;

    setScStatus('creating');
    setScMessage('Fetching SoundCloud metadata...');

    try {
      const res = await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackType: 'SOUNDCLOUD',
          soundcloudUrl: scUrl.trim(),
          title: scTitle.trim() || undefined,
          genre: scGenre.trim() || undefined,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || 'Error adding track');
      }

      setScStatus('success');
      setScMessage(`"${json.data.title}" added successfully!`);
      setScUrl('');
      setScTitle('');
      setScGenre('');
      setShowSoundcloudForm(false);
      triggerReload();

      setTimeout(() => {
        setScStatus('idle');
        setScMessage('');
      }, 3000);
    } catch (err) {
      setScStatus('error');
      setScMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [scUrl, scTitle, scGenre, triggerReload]);

  // === Edit-Modal-Handler ===
  const handleStartEdit = useCallback((track: AdminTrack) => {
    setEditingTrack(track);
  }, []);

  const handleEditSaved = useCallback(() => {
    triggerReload();
  }, [triggerReload]);

  const uploadBusy = uploadStatus === 'uploading' || uploadStatus === 'creating';

  return (
    <div>
      {/* Kopfzeile — Genre-Pflicht-Select + Upload-Button bewusst als EINE
          visuelle Upload-Gruppe gebündelt, damit das Select nicht wie ein
          Listen-Filter wirkt (der eigene Filter lebt unten in der Liste). */}
      <AdminPageHeader
        kickerTag="/T/"
        kicker="TRACK CONTROL"
        title="TRACKS"
        actions={
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-kbk-dark-800/40 px-2 py-1.5">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted select-none">
                Upload
              </span>
              <select
                value={uploadGenre}
                onChange={(e) => setUploadGenre(e.target.value)}
                aria-label="Genre for next upload"
                className={cn(adminSelectClass, 'px-2 py-1.5 text-xs')}
              >
                <option value="">Genre…</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <AdminButton
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={!uploadGenre}
                isLoading={uploadBusy}
                title={!uploadGenre ? 'Choose a genre first' : 'Upload MP3'}
              >
                {!uploadBusy && <Upload size={14} />}
                Upload Track
              </AdminButton>
            </div>
            <AdminButton
              variant="accent"
              size="sm"
              onClick={() => setShowSoundcloudForm(!showSoundcloudForm)}
            >
              <ExternalLink size={14} />
              SoundCloud
            </AdminButton>
          </>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,audio/mpeg"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* SoundCloud-Formular */}
      {showSoundcloudForm && (
        <AdminCard framed frame="yellow" className="mb-6">
          <h3 className="font-heading font-semibold text-lg mb-3 text-rasta-yellow">
            Add SoundCloud Track
          </h3>
          <div className="space-y-3">
            <input
              value={scUrl}
              onChange={(e) => setScUrl(e.target.value)}
              placeholder="https://soundcloud.com/artist/track-name"
              className={cn(adminInputClass, 'w-full')}
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={scTitle}
                onChange={(e) => setScTitle(e.target.value)}
                placeholder="Title (optional, fetched from SC)"
                className={cn(adminInputClass, 'flex-1')}
              />
              <select
                value={scGenre}
                onChange={(e) => setScGenre(e.target.value)}
                aria-label="SoundCloud track genre"
                className={cn(adminSelectClass, 'w-full sm:w-40')}
              >
                <option value="">Genre…</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <AdminButton
                variant="accent"
                onClick={handleSoundcloudAdd}
                disabled={!scUrl.trim()}
                isLoading={scStatus === 'creating'}
              >
                {scStatus === 'creating' ? 'Adding...' : 'Add'}
              </AdminButton>
              <AdminButton
                variant="ghost"
                onClick={() => setShowSoundcloudForm(false)}
              >
                Cancel
              </AdminButton>
            </div>
          </div>
        </AdminCard>
      )}

      {/* SoundCloud-Status-Banner */}
      {scStatus !== 'idle' && (
        <div
          className={cn(
            'mb-6 p-4 rounded-lg flex items-center gap-3 text-sm',
            scStatus === 'success' &&
              'bg-rasta-green/10 border border-rasta-green/20 text-rasta-green',
            scStatus === 'error' &&
              'bg-rasta-red/10 border border-rasta-red/20 text-rasta-red',
            scStatus === 'creating' &&
              'bg-rasta-yellow/10 border border-rasta-yellow/20 text-rasta-yellow'
          )}
        >
          {scStatus === 'success' && <CheckCircle size={18} />}
          {scStatus === 'error' && <AlertCircle size={18} />}
          {scStatus === 'creating' && (
            <Loader2 size={18} className="animate-spin" />
          )}
          {scMessage}
        </div>
      )}

      {/* Upload-Status-Banner */}
      {uploadStatus !== 'idle' && (
        <div
          className={cn(
            'mb-6 p-4 rounded-lg flex items-center gap-3 text-sm',
            uploadStatus === 'success' &&
              'bg-rasta-green/10 border border-rasta-green/20 text-rasta-green',
            uploadStatus === 'error' &&
              'bg-rasta-red/10 border border-rasta-red/20 text-rasta-red',
            (uploadStatus === 'uploading' || uploadStatus === 'creating') &&
              'bg-rasta-yellow/10 border border-rasta-yellow/20 text-rasta-yellow'
          )}
        >
          {uploadStatus === 'success' && <CheckCircle size={18} />}
          {uploadStatus === 'error' && <AlertCircle size={18} />}
          {(uploadStatus === 'uploading' || uploadStatus === 'creating') && (
            <Loader2 size={18} className="animate-spin" />
          )}
          {uploadMessage}
        </div>
      )}

      {/* Track-Liste (mit Filtern, Pagination, Suche, Drei-Punkte-Menue) */}
      <AdminTracksList onEdit={handleStartEdit} reloadToken={reloadToken} />

      {/* Edit-Modal */}
      {editingTrack && (
        <EditTrackModal
          track={editingTrack}
          onClose={() => setEditingTrack(null)}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  );
}
