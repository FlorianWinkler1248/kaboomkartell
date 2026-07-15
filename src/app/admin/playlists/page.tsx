'use client';

/**
 * Admin Playlists — Verwaltungsseite
 *
 * Playlists erstellen, bearbeiten und Tracks zuweisen.
 * Unterstützt manuelle und automatisch rotierende Playlists.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ListMusic,
  Plus,
  Trash2,
  Music2,
  Loader2,
  RotateCw,
  Star,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatArtistDisplay } from '@/lib/track-display';
import { PLAYLIST_TYPE_LABELS, GENRES } from '@/lib/constants';
import { useToast } from '@/components/providers/ToastProvider';
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
  adminSelectClass,
} from '@/components/admin/ui';

interface PlaylistData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  type: string;
  genre: string | null;
  bpmMin: number | null;
  bpmMax: number | null;
  rotationDays: number | null;
  maxTracks: number;
  isActive: boolean;
  isFeatured: boolean;
  trackCount: number;
  lastRotatedAt: string | null;
  createdAt: string;
}

interface TrackOption {
  id: string;
  title: string;
  artist: { username: string; displayName: string | null };
  // v2.27: Featuring-Awareness — Typeahead + Liste zeigen "feat. X"
  featuringArtist?: { username: string; displayName: string | null } | null;
  genre: string | null;
  bpm: number | null;
}

interface PlaylistTrackData {
  id: string;
  title: string;
  slug: string;
  genre: string | null;
  bpm: number | null;
  artist: { username: string; displayName: string | null };
  featuringArtist?: { username: string; displayName: string | null } | null;
  position: number;
}

export default function AdminPlaylistsPage() {
  const { toast } = useToast();
  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [loading, setLoading] = useState(true);

  // Erstellen-Formular
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    type: 'manual',
    genre: '',
    bpmMin: '',
    bpmMax: '',
    rotationDays: '',
    maxTracks: '15',
    isFeatured: false,
  });
  const [creating, setCreating] = useState(false);

  // Track-Management
  const [expandedPlaylist, setExpandedPlaylist] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrackData[]>([]);
  const [allTracks, setAllTracks] = useState<TrackOption[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [addingTrack, setAddingTrack] = useState(false);
  // Typeahead-Suche statt großer Select-Liste: flott auf Mobile, Click-add sofort
  const [trackSearch, setTrackSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const loadPlaylists = useCallback(async () => {
    try {
      const res = await fetch('/api/playlists');
      const json = await res.json();
      if (json.success) {
        setPlaylists(json.data);
      } else {
        toast({ message: json.error || 'Error loading playlists.', type: 'error' });
      }
    } catch (e) {
      console.error('Fehler beim Laden der Playlists:', e);
      toast({ message: 'Error loading playlists.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadAllTracks = useCallback(async () => {
    try {
      const res = await fetch('/api/tracks?pageSize=100&isPublic=true');
      const json = await res.json();
      if (json.success) {
        setAllTracks(json.data);
      } else {
        toast({ message: json.error || 'Error loading tracks.', type: 'error' });
      }
    } catch (e) {
      console.error('Fehler beim Laden der Tracks:', e);
      toast({ message: 'Error loading tracks.', type: 'error' });
    }
  }, [toast]);

  useEffect(() => {
    loadPlaylists();
    loadAllTracks();
  }, [loadPlaylists, loadAllTracks]);

  // Playlist erstellen
  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          bpmMin: createForm.bpmMin || undefined,
          bpmMax: createForm.bpmMax || undefined,
          rotationDays: createForm.rotationDays || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ message: 'Playlist created!', type: 'success' });
        setCreateForm({ name: '', description: '', type: 'manual', genre: '', bpmMin: '', bpmMax: '', rotationDays: '', maxTracks: '15', isFeatured: false });
        setShowCreate(false);
        loadPlaylists();
      } else {
        toast({ message: json.error || 'Error creating playlist.', type: 'error' });
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  // Playlist löschen
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete playlist "${name}"?`)) return;
    try {
      const res = await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast({ message: 'Playlist deleted.', type: 'success' });
        loadPlaylists();
      } else {
        toast({ message: json.error || 'Error deleting playlist.', type: 'error' });
      }
    } catch {
      toast({ message: 'Error deleting playlist.', type: 'error' });
    }
  };

  // Featured toggling
  const handleToggleFeatured = async (playlist: PlaylistData) => {
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFeatured: !playlist.isFeatured }),
      });
      const json = await res.json();
      if (json.success) {
        loadPlaylists();
      } else {
        toast({ message: json.error || 'Error updating playlist.', type: 'error' });
      }
    } catch {
      toast({ message: 'Error updating playlist.', type: 'error' });
    }
  };

  // Playlist-Tracks laden (wenn aufgeklappt)
  const handleExpand = async (playlistId: string) => {
    if (expandedPlaylist === playlistId) {
      setExpandedPlaylist(null);
      return;
    }

    setExpandedPlaylist(playlistId);
    setLoadingTracks(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}`);
      const json = await res.json();
      if (json.success) setPlaylistTracks(json.data.tracks || []);
    } catch {
      toast({ message: 'Error loading tracks.', type: 'error' });
    } finally {
      setLoadingTracks(false);
    }
  };

  // Track zur Playlist hinzufügen (wird direkt aus Typeahead-Click aufgerufen)
  const handleAddTrack = async (playlistId: string, trackId: string) => {
    if (!trackId || addingTrack) return;
    setAddingTrack(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ message: 'Track added!', type: 'success' });
        // Eingabe leeren und neu fokussieren — User kann gleich nächsten Track suchen
        setTrackSearch('');
        handleExpand(playlistId); // Neu laden
        loadPlaylists(); // Count updaten
      } else {
        toast({ message: json.error || 'Error adding track.', type: 'error' });
      }
    } catch {
      toast({ message: 'Network error.', type: 'error' });
    } finally {
      setAddingTrack(false);
    }
  };

  // Track aus Playlist entfernen
  const handleRemoveTrack = async (playlistId: string, trackId: string) => {
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ message: 'Track removed.', type: 'success' });
        handleExpand(playlistId);
        loadPlaylists();
      } else {
        toast({ message: json.error || 'Error removing track.', type: 'error' });
      }
    } catch {
      toast({ message: 'Error removing track.', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-muted" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        kickerTag="/PL/"
        kicker="CURATED SETS"
        title="PLAYLISTS"
        description={`${playlists.length} playlist${playlists.length === 1 ? '' : 's'} — manual picks and auto-rotations.`}
        actions={
          <AdminButton
            variant={showCreate ? 'ghost' : 'primary'}
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? <X size={16} /> : <Plus size={16} />}
            {showCreate ? 'Cancel' : 'New Playlist'}
          </AdminButton>
        }
      />

      {/* Erstellen-Formular — die eine Akzent-Karte der Seite, wenn offen */}
      {showCreate && (
        <AdminCard framed className="space-y-4">
          <h3 className="font-semibold text-foreground">Create Playlist</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Name *</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
                placeholder="Best of the Week"
              />
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">Type *</label>
              <select
                value={createForm.type}
                onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })}
                className={cn(adminSelectClass, 'w-full')}
              >
                <option value="manual">Manual</option>
                <option value="weekly-rotation">Weekly Rotation</option>
                <option value="monthly-rotation">Monthly Rotation</option>
                <option value="genre-rotation">Genre Rotation</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-muted mb-1">Description</label>
              <input
                type="text"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
                placeholder="The hottest tracks this week"
              />
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">Genre Filter</label>
              <select
                value={createForm.genre}
                onChange={(e) => setCreateForm({ ...createForm, genre: e.target.value })}
                className={cn(adminSelectClass, 'w-full')}
              >
                <option value="">All Genres</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm text-muted mb-1">BPM Min</label>
                <input
                  type="number"
                  value={createForm.bpmMin}
                  onChange={(e) => setCreateForm({ ...createForm, bpmMin: e.target.value })}
                  className={cn(adminInputClass, 'w-full')}
                  placeholder="120"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">BPM Max</label>
                <input
                  type="number"
                  value={createForm.bpmMax}
                  onChange={(e) => setCreateForm({ ...createForm, bpmMax: e.target.value })}
                  className={cn(adminInputClass, 'w-full')}
                  placeholder="160"
                />
              </div>
            </div>

            {createForm.type !== 'manual' && (
              <div>
                <label className="block text-sm text-muted mb-1">Rotation (days)</label>
                <input
                  type="number"
                  value={createForm.rotationDays}
                  onChange={(e) => setCreateForm({ ...createForm, rotationDays: e.target.value })}
                  className={cn(adminInputClass, 'w-full')}
                  placeholder="7"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-muted mb-1">Max Tracks</label>
              <input
                type="number"
                value={createForm.maxTracks}
                onChange={(e) => setCreateForm({ ...createForm, maxTracks: e.target.value })}
                className={cn(adminInputClass, 'w-full')}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={createForm.isFeatured}
                onChange={(e) => setCreateForm({ ...createForm, isFeatured: e.target.checked })}
                className="rounded border-border accent-rasta-green"
              />
              Featured (show on homepage)
            </label>
          </div>

          <AdminButton
            onClick={handleCreate}
            disabled={creating || !createForm.name.trim()}
            isLoading={creating}
          >
            Create Playlist
          </AdminButton>
        </AdminCard>
      )}

      {/* Playlist-Liste */}
      {playlists.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <ListMusic className="mx-auto mb-3 opacity-40" size={40} />
          <p>No playlists yet. Create your first one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {playlists.map((playlist) => (
            <AdminCard
              key={playlist.id}
              padding="none"
              className="overflow-hidden"
            >
              {/* Playlist-Header */}
              <div className="flex items-center justify-between p-4">
                <button
                  onClick={() => handleExpand(playlist.id)}
                  className="flex items-center gap-3 flex-1 text-left cursor-pointer"
                >
                  <div className="w-10 h-10 bg-elevated rounded-lg flex items-center justify-center shrink-0">
                    <Music2 className="text-muted" size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{playlist.name}</span>
                      {playlist.isFeatured && (
                        <Star className="text-rasta-yellow shrink-0" size={14} fill="currentColor" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase',
                        playlist.type === 'manual' ? 'bg-kbk-dark-700 border border-border text-secondary' :
                        playlist.type.includes('weekly') ? 'bg-rasta-green/15 text-rasta-green' :
                        playlist.type.includes('monthly') ? 'bg-rasta-green/10 text-rasta-green-light' :
                        'bg-rasta-yellow/15 text-rasta-yellow'
                      )}>
                        {PLAYLIST_TYPE_LABELS[playlist.type] || playlist.type}
                      </span>
                      <span>{playlist.trackCount} tracks</span>
                      {playlist.genre && <span>/ {playlist.genre}</span>}
                      {playlist.rotationDays && (
                        <span className="flex items-center gap-0.5">
                          <RotateCw size={10} /> every {playlist.rotationDays}d
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleFeatured(playlist)}
                    className={cn(
                      'p-2 rounded-lg transition-colors cursor-pointer',
                      playlist.isFeatured ? 'text-rasta-yellow hover:text-rasta-yellow/80' : 'text-muted hover:text-foreground'
                    )}
                    title={playlist.isFeatured ? 'Remove from featured' : 'Add to featured'}
                  >
                    <Star size={16} fill={playlist.isFeatured ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={() => handleDelete(playlist.id, playlist.name)}
                    className="p-2 text-muted hover:text-rasta-red rounded-lg transition-colors cursor-pointer"
                    title="Delete playlist"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    onClick={() => handleExpand(playlist.id)}
                    className="p-2 text-muted hover:text-foreground rounded-lg transition-colors cursor-pointer"
                  >
                    {expandedPlaylist === playlist.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Aufgeklappter Track-Bereich */}
              {expandedPlaylist === playlist.id && (
                <div className="border-t border-border p-4 space-y-3">
                  {/* Track hinzufügen — Typeahead statt großer Select-Liste.
                      Filtert live auf Titel + Artist, zeigt max. 8 Treffer,
                      Click auf Eintrag fügt sofort hinzu. */}
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={trackSearch}
                          onChange={(e) => {
                            setTrackSearch(e.target.value);
                            setShowSuggestions(true);
                          }}
                          onFocus={() => setShowSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                          placeholder="Search track by title or artist..."
                          className={cn(adminInputClass, 'w-full pr-8')}
                        />
                        {trackSearch && (
                          <button
                            type="button"
                            onClick={() => setTrackSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                            aria-label="Clear search"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      {addingTrack && (
                        <Loader2 className="animate-spin text-rasta-green" size={16} />
                      )}
                    </div>

                    {/* Suggestions-Dropdown */}
                    {showSuggestions && (() => {
                      const q = trackSearch.trim().toLowerCase();
                      const available = allTracks.filter(
                        (t) => !playlistTracks.some((pt) => pt.id === t.id)
                      );
                      const filtered = q
                        ? available.filter((t) => {
                            // Featuring-aware Search: "Boomy" findet auch "4Flow feat. Boomy"
                            const artistName = formatArtistDisplay(t).toLowerCase();
                            return (
                              t.title.toLowerCase().includes(q) ||
                              artistName.includes(q) ||
                              (t.genre ?? '').toLowerCase().includes(q)
                            );
                          })
                        : available;
                      const top = filtered.slice(0, 8);
                      if (top.length === 0) return null;
                      return (
                        <ul className="absolute left-0 right-0 top-full mt-1 z-20 bg-kbk-dark-800 border border-border rounded-lg shadow-xl max-h-80 overflow-y-auto">
                          {top.map((t) => (
                            <li key={t.id}>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault(); // blur verhindern
                                  handleAddTrack(playlist.id, t.id);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-elevated/70 transition-colors flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-foreground truncate">
                                    {t.title}
                                  </div>
                                  <div className="text-xs text-muted truncate">
                                    {formatArtistDisplay(t)}
                                    {t.genre ? ` · ${t.genre}` : ''}
                                    {t.bpm ? ` · ${t.bpm} BPM` : ''}
                                  </div>
                                </div>
                                <Plus size={14} className="text-rasta-green shrink-0" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>

                  {/* Track-Liste */}
                  {loadingTracks ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="animate-spin text-muted" size={20} />
                    </div>
                  ) : playlistTracks.length === 0 ? (
                    <p className="text-center text-muted text-sm py-4">No tracks in this playlist yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {playlistTracks.map((track, index) => (
                        <div
                          key={track.id}
                          className="flex items-center justify-between px-3 py-2 bg-elevated/50 rounded-lg"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs text-muted w-5 text-right shrink-0">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm text-foreground truncate">{track.title}</p>
                              <p className="text-xs text-muted truncate">
                                {formatArtistDisplay(track)}
                                {track.genre ? ` — ${track.genre}` : ''}
                                {track.bpm ? ` / ${track.bpm}bpm` : ''}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveTrack(playlist.id, track.id)}
                            className="p-1.5 text-muted hover:text-rasta-red rounded transition-colors cursor-pointer shrink-0"
                            title="Remove from playlist"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </AdminCard>
          ))}
        </div>
      )}
    </div>
  );
}
