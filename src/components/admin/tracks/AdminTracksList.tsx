'use client';

/**
 * Admin Tracks Liste mit Pagination, Filtern und Suche
 *
 * Hält den kompletten Filter-State (Seite, Genre, Status, Suche) und synchronisiert
 * ihn mit der URL (Browser-Back/Forward bleibt funktionsfaehig). Tracks werden
 * über /api/admin/tracks nachgeladen, das serverseitig filtert und paginiert.
 *
 * Jede Track-Zeile ist eine Card mit Cover, Titel, Status- und Genre-Badge,
 * Dauer sowie einem Drei-Punkte-Menue für Edit / Publish-Toggle / Archive.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  EyeOff,
  Filter,
  Loader2,
  MoreVertical,
  Music2,
  Search,
  X,
} from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';
import { SafeImg } from '@/components/ui/SafeImg';
import {
  AdminCard,
  adminInputClass,
  adminSelectClass,
} from '@/components/admin/ui';
import { useToast } from '@/components/providers/ToastProvider';

// === Typen ===

interface Artist {
  id: string;
  username: string;
  displayName: string | null;
}

export interface AdminTrack {
  id: string;
  title: string;
  slug: string;
  trackType?: string;
  duration: number;
  coverUrl?: string | null;
  soundcloudArtwork?: string | null;
  genre: string | null;
  bpm: number | null;
  status: string;
  isPublic: boolean;
  aiDisclosure: string | null;
  playCount: number;
  fileName?: string | null;
  fileSize?: number | null;
  soundcloudUrl?: string | null;
  artist: Artist;
  streamUrl: string;
  createdAt?: string;
}

interface ListResponse {
  success: boolean;
  data: AdminTrack[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  genres: string[];
  error?: string;
}

type StatusFilter = 'ALL' | 'PUBLIC' | 'HIDDEN' | 'ARCHIVED';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PUBLIC', label: 'Public' },
  { key: 'HIDDEN', label: 'Hidden' },
  { key: 'ARCHIVED', label: 'Archived' },
];

const PAGE_SIZE = 10;

// === Hilfs-Badges ===

function StatusBadge({ track }: { track: { isPublic: boolean; status: string } }) {
  // Farbige Pill: Archived > Public > Hidden (Airplay-Gate ist isPublic).
  const entry =
    track.status === 'ARCHIVED'
      ? { label: 'Archived', cls: 'bg-kbk-dark-700 text-muted' }
      : track.isPublic
        ? { label: 'Public', cls: 'bg-rasta-green/10 text-rasta-green' }
        : { label: 'Hidden', cls: 'bg-rasta-yellow/10 text-rasta-yellow' };
  return (
    <span
      className={cn(
        'px-2 py-0.5 text-[11px] font-semibold rounded-full whitespace-nowrap',
        entry.cls
      )}
    >
      {entry.label}
    </span>
  );
}

function GenreBadge({ genre }: { genre: string | null }) {
  if (!genre) return null;
  return (
    <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-elevated text-secondary whitespace-nowrap">
      {genre}
    </span>
  );
}

// === Pager ===

interface PagerProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

function Pager({ page, totalPages, onChange }: PagerProps) {
  // Einfache Pager-Logik: zeige aktuelle Seite +/- 1, mit Ellipsen
  const pages = useMemo<(number | 'gap')[]>(() => {
    const list: (number | 'gap')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) list.push(i);
      return list;
    }
    list.push(1);
    if (page > 3) list.push('gap');
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) list.push(i);
    if (page < totalPages - 2) list.push('gap');
    list.push(totalPages);
    return list;
  }, [page, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-1 pt-4"
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-secondary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed rounded-lg hover:bg-elevated transition-colors cursor-pointer"
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>

      {pages.map((p, idx) =>
        p === 'gap' ? (
          <span key={`gap-${idx}`} className="px-2 text-muted">
            ...
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              'min-w-[32px] px-2 py-1.5 text-sm rounded-lg transition-colors cursor-pointer',
              p === page
                ? 'bg-rasta-green/20 text-rasta-green font-semibold'
                : 'text-secondary hover:text-foreground hover:bg-elevated'
            )}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-secondary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed rounded-lg hover:bg-elevated transition-colors cursor-pointer"
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

// === Action-Menue ===

interface ActionMenuProps {
  track: AdminTrack;
  onEdit: (track: AdminTrack) => void;
  onToggleStatus: (track: AdminTrack) => void;
  onArchive: (track: AdminTrack) => void;
  isOpen: boolean;
  onToggle: (id: string | null) => void;
}

function ActionMenu({
  track,
  onEdit,
  onToggleStatus,
  onArchive,
  isOpen,
  onToggle,
}: ActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Klick außerhalb schließt das Menue
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onToggle(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);

  // ESC schließt das Menue
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onToggle]);

  const isPublished = track.isPublic;
  const isArchived = track.status === 'ARCHIVED';

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e: ReactMouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle(isOpen ? null : track.id);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-elevated transition-colors cursor-pointer"
        title="Actions"
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-lg border border-border bg-kbk-dark-800 shadow-xl py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggle(null);
              onEdit(track);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-secondary hover:text-foreground hover:bg-elevated transition-colors cursor-pointer"
          >
            <Edit size={14} />
            Edit
          </button>

          {!isArchived && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggle(null);
                onToggleStatus(track);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-secondary hover:text-foreground hover:bg-elevated transition-colors cursor-pointer"
            >
              {isPublished ? (
                <>
                  <EyeOff size={14} />
                  Unpublish
                </>
              ) : (
                <>
                  <Eye size={14} />
                  Publish
                </>
              )}
            </button>
          )}

          <div className="my-1 h-px bg-border" />

          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggle(null);
              onArchive(track);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-rasta-red hover:bg-rasta-red/10 transition-colors cursor-pointer"
          >
            <Archive size={14} />
            Archive
          </button>
        </div>
      )}
    </div>
  );
}

// === Haupt-Komponente ===

interface AdminTracksListProps {
  onEdit: (track: AdminTrack) => void;
  /**
   * Jede Änderung dieses Tokens triggert einen Reload der Liste,
   * z.B. nach einem Upload oder nach dem Speichern einer Bearbeitung vom Parent.
   */
  reloadToken: number;
}

export default function AdminTracksList({
  onEdit,
  reloadToken,
}: AdminTracksListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // === URL-abgeleiteter Filter-State ===
  const urlPage = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const urlGenre = searchParams.get('genre') || '';
  const urlStatusRaw = (searchParams.get('status') || 'ALL').toUpperCase();
  const VALID_STATUSES: readonly string[] = ['ALL', 'PUBLIC', 'HIDDEN', 'ARCHIVED'];
  const urlStatus: StatusFilter = VALID_STATUSES.includes(urlStatusRaw)
    ? (urlStatusRaw as StatusFilter)
    : 'ALL';
  const urlSearch = searchParams.get('search') || '';

  // Sucheingabe wird lokal gehalten und nach 300ms in die URL debounced
  const [searchInput, setSearchInput] = useState(urlSearch);

  // Daten-State
  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Interner Reload-Counter — wird nach Aktionen hochgezaehlt, um den Load-Effect
  // neu anzustossen, ohne die URL anzufassen.
  const [internalReload, setInternalReload] = useState(0);

  // Wenn sich der URL-search-Parameter extern ändert (z.B. Browser-Back), Input syncen
  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  // === URL-Updater ===
  const pushParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '' || value === 'ALL') {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      // page=1 muss nicht in der URL stehen
      if (params.get('page') === '1') params.delete('page');
      const qs = params.toString();
      router.push(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams]
  );

  // === Debounced Search-Sync zur URL ===
  useEffect(() => {
    if (searchInput === urlSearch) return;
    const timer = setTimeout(() => {
      pushParams({ search: searchInput || null, page: null });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, urlSearch, pushParams]);

  // === Tracks laden — einziger Load-Effect, reagiert auf alle Trigger ===
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', String(urlPage));
        params.set('pageSize', String(PAGE_SIZE));
        if (urlStatus !== 'ALL') params.set('status', urlStatus);
        if (urlGenre) params.set('genre', urlGenre);
        if (urlSearch) params.set('search', urlSearch);

        const res = await fetch(`/api/admin/tracks?${params.toString()}`);
        const json = (await res.json()) as ListResponse;

        if (cancelled) return;

        if (!json.success) {
          throw new Error(json.error || 'Error loading tracks');
        }

        setTracks(json.data);
        setTotal(json.total);
        setTotalPages(json.totalPages);
        setAvailableGenres(json.genres);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [urlPage, urlStatus, urlGenre, urlSearch, reloadToken, internalReload]);

  // Reload ohne URL-Änderung
  const reload = useCallback(() => {
    setInternalReload((x) => x + 1);
  }, []);

  // === Filter-Handler ===
  const handleGenreChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      pushParams({ genre: e.target.value || null, page: null });
    },
    [pushParams]
  );

  const handleStatusChange = useCallback(
    (status: StatusFilter) => {
      pushParams({ status: status === 'ALL' ? null : status, page: null });
    },
    [pushParams]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      pushParams({ page: page === 1 ? null : page });
      setOpenMenuId(null);
    },
    [pushParams]
  );

  const handleSearchClear = useCallback(() => {
    setSearchInput('');
    pushParams({ search: null, page: null });
  }, [pushParams]);

  // === Track-Aktionen ===
  // Mutations-Feedback via Toast — stille Fehler sind verboten (Admin-Konvention).
  const handleToggleStatus = useCallback(
    async (track: AdminTrack) => {
      try {
        const res = await fetch(`/api/tracks/${track.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: !track.isPublic }),
        });
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error || 'Something went wrong.');
        }
        toast({
          type: 'success',
          message: track.isPublic ? 'Track unpublished.' : 'Track published.',
        });
        reload();
      } catch (err) {
        toast({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Something went wrong.',
        });
      }
    },
    [reload, toast]
  );

  const handleArchive = useCallback(
    async (track: AdminTrack) => {
      if (!confirm(`Archive "${track.title}"?`)) return;
      try {
        const res = await fetch(`/api/tracks/${track.id}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error || 'Something went wrong.');
        }
        toast({ type: 'success', message: 'Track archived.' });
        reload();
      } catch (err) {
        toast({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Something went wrong.',
        });
      }
    },
    [reload, toast]
  );

  // === Render ===

  return (
    <div>
      {/* Toolbar: Suche, Genre, Status-Tabs */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Suche */}
          <div className="relative flex-1 min-w-0">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title or artist..."
              className={cn(adminInputClass, 'w-full pl-9 pr-9')}
              aria-label="Search tracks"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleSearchClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-foreground cursor-pointer"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Genre-Dropdown */}
          <div className="relative sm:w-56">
            <Filter
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <select
              value={urlGenre}
              onChange={handleGenreChange}
              className={cn(
                adminSelectClass,
                'w-full appearance-none pl-9 pr-9'
              )}
              aria-label="Filter by genre"
            >
              <option value="">All Genres</option>
              {availableGenres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            {/* Dropdown-Pfeil */}
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
            >
              <path
                d="M2 4l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Status-Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-kbk-dark-800/60 border border-border w-fit">
          {STATUS_TABS.map((tab) => {
            const active = urlStatus === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleStatusChange(tab.key)}
                aria-pressed={active}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer',
                  active
                    ? 'bg-rasta-green/20 text-rasta-green'
                    : 'text-secondary hover:text-foreground hover:bg-elevated'
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary-Zeile */}
      <div className="flex items-center justify-between mb-3 text-xs text-muted">
        <span>
          {loading ? (
            'Loading tracks...'
          ) : (
            <>
              <span className="text-secondary font-medium">{total}</span>{' '}
              {total === 1 ? 'track' : 'tracks'}
              {total > 0 && totalPages > 0 && (
                <>
                  {' · '}
                  Page{' '}
                  <span className="text-secondary font-medium">{urlPage}</span>{' '}
                  of {totalPages}
                </>
              )}
            </>
          )}
        </span>
      </div>

      {/* Fehler-Banner */}
      {error && (
        <div className="mb-3 p-3 rounded-lg bg-rasta-red/10 border border-rasta-red/20 text-rasta-red text-sm">
          {error}
        </div>
      )}

      {/* Liste oder Leerzustand */}
      {loading && tracks.length === 0 ? (
        <AdminCard padding="none" className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-rasta-green" size={24} />
        </AdminCard>
      ) : tracks.length === 0 ? (
        <AdminCard padding="none" className="text-center py-16">
          <Music2 size={36} className="mx-auto text-muted mb-3" />
          <p className="text-muted">No tracks found.</p>
          <p className="text-sm text-muted/70 mt-1">
            Try adjusting your filters or search.
          </p>
        </AdminCard>
      ) : (
        <div className="space-y-2">
          {tracks.map((track) => {
            const cover = track.coverUrl || track.soundcloudArtwork;
            const _main =
              track.artist.displayName || track.artist.username;
            const _feat = (track as { featuringArtist?: { displayName?: string | null; username?: string } | null }).featuringArtist?.displayName
              || (track as { featuringArtist?: { displayName?: string | null; username?: string } | null }).featuringArtist?.username;
            const artistLabel = _feat ? `${_main} feat. ${_feat}` : _main;
            return (
              <Link
                key={track.id}
                href={`/tracks/${track.slug}`}
                className={cn(
                  'group flex items-center gap-4 p-4 sm:p-5 rounded-xl kbk-obsidian border border-border/60',
                  'hover:border-rasta-green/40 transition-all',
                  // kbk-obsidian isoliert den Stacking-Context — Zeile mit
                  // offenem Menue anheben, sonst malen Folge-Zeilen drüber.
                  openMenuId === track.id && 'z-30'
                )}
              >
                {/* Cover */}
                <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-elevated flex items-center justify-center">
                  <SafeImg
                    src={cover}
                    alt=""
                    className="w-full h-full object-cover"
                    fallback={<Music2 size={16} className="text-muted" />}
                  />
                </div>

                {/* Titel + Artist */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm text-foreground truncate">
                      {track.trackType === 'SOUNDCLOUD' && (
                        <span className="inline-block mr-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-rasta-yellow/10 text-rasta-yellow rounded align-middle">
                          SC
                        </span>
                      )}
                      {track.title}
                    </p>
                  </div>
                  <p className="text-xs text-muted truncate mt-0.5">
                    {artistLabel}
                  </p>
                </div>

                {/* Badges */}
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  <GenreBadge genre={track.genre} />
                  <StatusBadge track={track} />
                </div>

                {/* Duration */}
                <span className="hidden md:block text-xs text-muted tabular-nums shrink-0 w-12 text-right">
                  {track.duration > 0 ? formatTime(track.duration) : '--:--'}
                </span>

                {/* Action-Menue — Klicks hier NICHT an den Link weitergeben */}
                <div
                  onClick={(e: ReactMouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="shrink-0"
                >
                  <ActionMenu
                    track={track}
                    onEdit={onEdit}
                    onToggleStatus={handleToggleStatus}
                    onArchive={handleArchive}
                    isOpen={openMenuId === track.id}
                    onToggle={setOpenMenuId}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pager */}
      <Pager
        page={urlPage}
        totalPages={totalPages}
        onChange={handlePageChange}
      />
    </div>
  );
}
