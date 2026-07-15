'use client';

/**
 * Modal zum Bearbeiten von Track-Metadaten: Titel, Genre, KI-Anteil
 * (aiDisclosure) und Sichtbarkeit (isPublic). Wird aus AdminTracksList
 * (via onEdit) geöffnet.
 */

import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminTrack } from './AdminTracksList';
import { GENRES, AI_DISCLOSURE } from '@/lib/constants';
import {
  AdminButton,
  adminInputClass,
  adminSelectClass,
} from '@/components/admin/ui';
import { useToast } from '@/components/providers/ToastProvider';

interface EditTrackModalProps {
  track: AdminTrack;
  onClose: () => void;
  onSaved: () => void;
}

const AI_OPTIONS = [
  { value: AI_DISCLOSURE.HUMAN, label: 'Human — no AI' },
  { value: AI_DISCLOSURE.AI_ASSISTED, label: 'Hybrid — 4Flow feat. Boomy' },
  { value: AI_DISCLOSURE.AI_GENERATED, label: 'AI — Boomy-only' },
] as const;

export default function EditTrackModal({
  track,
  onClose,
  onSaved,
}: EditTrackModalProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(track.title);
  const [genre, setGenre] = useState(track.genre || '');
  const [aiDisclosure, setAiDisclosure] = useState(track.aiDisclosure || '');
  const [isPublic, setIsPublic] = useState(track.isPublic ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC schließt das Modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, saving]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title required');
      return;
    }
    if (!genre) {
      setError('Genre required — every track belongs to one of the 4 pools');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${track.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          genre,
          aiDisclosure: aiDisclosure || null,
          isPublic,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      toast({ type: 'success', message: 'Track updated.' });
      onSaved();
      onClose();
    } catch (err) {
      // Fehler doppelt sichtbar: Inline-Box im Modal + Toast (kein Silent-Fail).
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast({ type: 'error', message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-track-title"
    >
      <div
        className="w-full max-w-md rounded-xl kbk-obsidian framed shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 id="edit-track-title" className="font-heading font-semibold text-lg">
            Edit Track
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded text-muted hover:text-foreground hover:bg-elevated transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <label
              htmlFor="edit-title"
              className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5"
            >
              Title
            </label>
            <input
              id="edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              autoFocus
              className={cn(adminInputClass, 'w-full')}
            />
          </div>

          <div>
            <label
              htmlFor="edit-genre"
              className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5"
            >
              Genre
            </label>
            <select
              id="edit-genre"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              disabled={saving}
              className={cn(adminSelectClass, 'w-full')}
            >
              <option value="">Choose genre…</option>
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="edit-ai"
              className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5"
            >
              AI Content
            </label>
            <select
              id="edit-ai"
              value={aiDisclosure}
              onChange={(e) => setAiDisclosure(e.target.value)}
              disabled={saving}
              className={cn(adminSelectClass, 'w-full')}
            >
              <option value="">Not set</option>
              {AI_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sichtbarkeit — isPublic ist das Airplay-Gate. */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={saving}
              className="w-4 h-4 accent-rasta-green cursor-pointer"
            />
            <span className="text-sm">
              <span className="font-semibold">Public</span>
              <span className="text-muted"> — eligible to air on the radio</span>
            </span>
          </label>

          {error && (
            <div className="p-2.5 rounded-lg bg-rasta-red/10 border border-rasta-red/20 text-rasta-red text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <AdminButton
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </AdminButton>
          <AdminButton
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={!title.trim()}
            isLoading={saving}
          >
            {!saving && <Save size={14} />}
            Save
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
