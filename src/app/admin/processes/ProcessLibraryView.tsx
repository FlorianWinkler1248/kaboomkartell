'use client';

/**
 * Process Library — Admin View
 *
 * Rendert alle Workflows aus dem Sp5-Top-Level prozesse/-Verzeichnis (Build-Time-Bundle).
 *
 * - Sidebar links: Suchfeld + gruppierte Liste nach Modul (kbk / pflicht / master-hub / boomy / other)
 * - Modal rechts: Title + Status/Tier/Audiences-Badges + Markdown-Body + Mermaid (lazy-loaded)
 * - EN/DE-Toggle oben rechts (Default EN; bei DE-Fallback Hinweis-Badge)
 *
 * Mermaid wird lazy vom CDN geladen beim ersten Code-Block, nicht im Bundle.
 * Markdown- + Mermaid-Rendering kommen aus dem geteilten Modul
 * `@/lib/process-markdown` (dieselbe Quelle wie das öffentliche Hilfe-Center).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, X, Globe, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminPageHeader, AdminCard, AdminButton, adminInputClass } from '@/components/admin/ui';
import { ensureMermaid, renderMarkdown } from '@/lib/process-markdown';

const MODULE_LABELS: Record<string, string> = {
  kbk: 'KBK Platform',
  pflicht: 'Mandatory (Brain-Wide)',
  'master-hub': 'Master Hub',
  boomy: 'Boomy',
  other: 'Other',
};

const MODULE_ORDER = ['kbk', 'pflicht', 'master-hub', 'boomy', 'other'];

// Statusfarben-Semantik: grün = live/ok, gelb = pending, muted = inaktiv/geplant, rot = kritisch.
const STATUS_COLORS: Record<string, string> = {
  live: 'bg-rasta-green/20 text-rasta-green border-rasta-green/40',
  draft: 'bg-rasta-yellow/15 text-rasta-yellow border-rasta-yellow/40',
  planned: 'bg-elevated/60 text-secondary border-border',
  deprecated: 'bg-rasta-red/15 text-rasta-red-light border-rasta-red/40',
};

const TIER_COLORS: Record<string, string> = {
  core: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  'strong-default': 'bg-rasta-green/10 text-rasta-green-light border-rasta-green/30',
  'nice-to-have': 'bg-elevated/60 text-muted border-border',
};

// Audience-Pillen: dezente Rotation aus Rasta-Tönen + Violet, deterministisch pro Name.
const AUDIENCE_PILL_CLASSES = [
  'border-rasta-green/30 text-rasta-green-light',
  'border-rasta-yellow/30 text-rasta-yellow-light',
  'border-violet-500/30 text-violet-300',
];

function audiencePillClass(audience: string): string {
  let hash = 0;
  for (const ch of audience) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AUDIENCE_PILL_CLASSES[hash % AUDIENCE_PILL_CLASSES.length];
}

interface ListItem {
  id: string;
  idRaw: string;
  module: string;
  title: string;
  summary: string;
  audiences: string[];
  status: string;
  tier: string;
  lastReviewed: string | null;
  hasEn: boolean;
  hasMermaid: boolean;
}

interface DetailItem {
  id: string;
  idRaw: string;
  module: string;
  relPath: string;
  title: string;
  titleDe: string;
  summary: string;
  summaryDe: string;
  audiences: string[];
  status: string;
  tier: string;
  lastReviewed: string | null;
  validation: string | null;
  relatedWorkflows: string[];
  relatedAdrs: string[];
  relatedCode: string[];
  readWhen: string[];
  visualisierung: string | null;
  hasEn: boolean;
  requestedLang: 'en' | 'de';
  actualLang: 'en' | 'de' | 'de-fallback';
  body: string;
}

type Lang = 'en' | 'de';

// Markdown-Renderer (escapeHtml + renderMarkdown) und Mermaid-Lazy-Loader
// (ensureMermaid) leben jetzt geteilt in '@/lib/process-markdown' — genutzt von
// dieser Admin-View UND dem öffentlichen Hilfe-Center (HelpCenterView).

export default function ProcessLibraryView() {
  const [lang, setLang] = useState<Lang>('en');
  const [items, setItems] = useState<ListItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [totalWithEn, setTotalWithEn] = useState(0);
  // Kein setLoading(true) mehr im Effect (react-hooks/set-state-in-effect):
  // loading ist abgeleitet — solange die zuletzt fertig geladene Sprache nicht
  // der angefragten entspricht, läuft der Fetch noch.
  const [loadedLang, setLoadedLang] = useState<Lang | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = loadedLang !== lang;

  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailItem | null>(null);
  // Merker "id:lang" des zuletzt abgeschlossenen Detail-Fetches — detailLoading
  // wird daraus abgeleitet statt synchron im Effect gesetzt.
  const [detailKey, setDetailKey] = useState<string | null>(null);
  // Detail-Fehler separat vom Seiten-Error — der Inline-Banner der Seite
  // läge unsichtbar HINTER dem offenen Modal (fixed z-50).
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailLoading = activeId !== null && detailKey !== `${activeId}:${lang}`;
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/processes?lang=${lang}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.success) {
          setError(data.error || 'Failed to load.');
        } else {
          setItems(data.items);
          setGeneratedAt(data.generatedAt);
          setTotalWithEn(data.totalWithEn);
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoadedLang(lang));
    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetch(`/api/admin/processes/${activeId}?lang=${lang}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.success) {
          setDetailError(data.error || 'Failed to load detail.');
        } else {
          setDetail(data.process);
          setDetailError(null);
        }
      })
      .catch((e) => !cancelled && setDetailError(String(e)))
      .finally(() => !cancelled && setDetailKey(`${activeId}:${lang}`));
    return () => {
      cancelled = true;
    };
  }, [activeId, lang]);

  const grouped = useMemo(() => {
    const filter = search.toLowerCase().trim();
    const filtered = filter
      ? items.filter(
          (i) =>
            i.title.toLowerCase().includes(filter) ||
            i.summary.toLowerCase().includes(filter) ||
            i.id.toLowerCase().includes(filter) ||
            i.audiences.some((a) => a.toLowerCase().includes(filter)),
        )
      : items;
    const map = new Map<string, ListItem[]>();
    for (const item of filtered) {
      if (!map.has(item.module)) map.set(item.module, []);
      map.get(item.module)!.push(item);
    }
    return MODULE_ORDER.filter((m) => map.has(m)).map((m) => ({
      module: m,
      items: map.get(m)!.sort((a, b) => a.title.localeCompare(b.title)),
    }));
  }, [items, search]);

  const renderedBody = useMemo(() => {
    if (!detail) return { html: '', mermaidBlocks: [] as string[] };
    const mermaidBlocks: string[] = [];
    const html = renderMarkdown(detail.body, mermaidBlocks);
    return { html, mermaidBlocks };
  }, [detail]);

  useEffect(() => {
    if (!detail || renderedBody.mermaidBlocks.length === 0) return;
    let cancelled = false;
    ensureMermaid()
      .then(async () => {
        if (cancelled) return;
        const nodes = modalRef.current?.querySelectorAll('pre.mermaid');
        if (nodes && nodes.length > 0 && window.mermaid) {
          try {
            await window.mermaid.run({ nodes });
          } catch {
            // Mermaid-Render-Fehler: Code-Block bleibt sichtbar als Fallback
          }
        }
      })
      .catch(() => {
        // CDN unreachable — Code-Block bleibt sichtbar
      });
    return () => {
      cancelled = true;
    };
  }, [detail, renderedBody.mermaidBlocks.length]);

  const onClose = useCallback(() => {
    // Detail-Reset gehört in den Event-Handler, nicht in den Effect
    // (vermeidet den zweiten set-state-in-effect-Verstoß).
    setActiveId(null);
    setDetail(null);
    setDetailKey(null);
    setDetailError(null);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeId, onClose]);

  const headerDescription = `${items.length} workflows${
    generatedAt
      ? ` · bundle generated ${new Date(generatedAt).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE')}`
      : ''
  }${totalWithEn > 0 ? ` · ${totalWithEn} with full EN translation` : ''}`;

  return (
    <div className="flex flex-col h-full max-w-7xl mx-auto w-full">
      <AdminPageHeader
        kickerTag="/W/"
        kicker="WORKFLOW BACKBONE"
        title="PROCESS LIBRARY"
        description={headerDescription}
        actions={
          <AdminButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setLang(lang === 'en' ? 'de' : 'en')}
            title={lang === 'en' ? 'Switch to German' : 'Switch to English'}
          >
            <Globe size={14} />
            {lang === 'en' ? 'EN' : 'DE'}
          </AdminButton>
        }
      />

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === 'en' ? 'Search workflows, audiences…' : 'Workflows, Audiences durchsuchen…'}
          className={cn(adminInputClass, 'w-full pl-9')}
        />
      </div>

      {loading && <p className="text-muted text-sm py-8 text-center">Loading…</p>}
      {error && (
        <AdminCard framed frame="red" padding="sm" className="flex items-center gap-2 text-sm text-rasta-red-light mb-3">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </AdminCard>
      )}

      <AdminCard padding="sm" className="flex-1 overflow-y-auto space-y-6">
        {grouped.map((group) => (
          <section key={group.module}>
            <h2 className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted mb-2">
              {MODULE_LABELS[group.module] || group.module} <span className="text-secondary">({group.items.length})</span>
            </h2>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(item.id)}
                    className="w-full text-left p-3 rounded-lg bg-kbk-dark-800/60 border border-border kbk-card-hover cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium group-hover:text-rasta-green transition">{item.title}</div>
                        {item.summary && <div className="text-sm text-muted mt-0.5 line-clamp-2">{item.summary}</div>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        {item.status && (
                          <span className={`px-1.5 py-0.5 text-xs border rounded ${STATUS_COLORS[item.status] || ''}`}>
                            {item.status}
                          </span>
                        )}
                        {item.tier && (
                          <span className={`px-1.5 py-0.5 text-xs border rounded ${TIER_COLORS[item.tier] || ''}`}>
                            {item.tier}
                          </span>
                        )}
                        {!item.hasEn && lang === 'en' && (
                          <span className="px-1.5 py-0.5 text-xs border border-rasta-yellow/40 text-rasta-yellow rounded" title="Body not yet translated to English">
                            DE only
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!loading && grouped.length === 0 && <p className="text-muted text-sm py-8 text-center">No workflows match.</p>}
      </AdminCard>

      {activeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
          <AdminCard
            padding="none"
            className="w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg sm:text-xl tracking-wider text-rasta-green">{detail?.title || 'Loading…'}</h2>
                {detail && (
                  <p className="text-xs text-muted mt-0.5 break-all">{detail.relPath}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-muted hover:text-foreground rounded-lg hover:bg-elevated transition shrink-0 cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            {/* modalRef sitzt auf dem Scroll-Body (Mermaid-Blöcke leben hier),
                weil AdminCard als Function-Component keinen Ref forwardet. */}
            <div ref={modalRef} className="overflow-y-auto p-4 flex-1">
              {detailLoading && <p className="text-muted text-sm">Loading detail…</p>}
              {!detailLoading && detailError && (
                <p className="text-sm text-rasta-red-light">{detailError}</p>
              )}
              {detail && (
                <>
                  {detail.actualLang === 'de-fallback' && (
                    <div className="flex items-center gap-2 p-2 mb-3 bg-rasta-yellow/10 border border-rasta-yellow/40 rounded-lg text-xs text-rasta-yellow">
                      <AlertCircle size={14} className="shrink-0" />
                      English translation not available — showing German original.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className={`px-2 py-0.5 text-xs border rounded ${STATUS_COLORS[detail.status] || ''}`}>{detail.status}</span>
                    <span className={`px-2 py-0.5 text-xs border rounded ${TIER_COLORS[detail.tier] || ''}`}>{detail.tier}</span>
                    {detail.audiences.map((a) => (
                      <span key={a} className={`px-2 py-0.5 text-xs border rounded ${audiencePillClass(a)}`}>
                        {a}
                      </span>
                    ))}
                    {detail.lastReviewed && (
                      <span className="px-2 py-0.5 text-xs border border-border rounded text-muted">last reviewed: {detail.lastReviewed}</span>
                    )}
                  </div>
                  {detail.summary && <p className="text-sm text-muted italic mb-4 border-l-2 border-rasta-green/40 pl-3">{detail.summary}</p>}
                  <article
                    className="prose prose-invert max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: renderedBody.html }}
                  />
                  {(detail.relatedWorkflows.length > 0 || detail.relatedAdrs.length > 0 || detail.relatedCode.length > 0) && (
                    <div className="mt-6 pt-4 border-t border-border text-xs">
                      <h3 className="font-semibold mb-2 text-muted uppercase tracking-wider">Related</h3>
                      {detail.relatedWorkflows.length > 0 && (
                        <p className="mb-1"><span className="text-muted">Workflows:</span> {detail.relatedWorkflows.join(', ')}</p>
                      )}
                      {detail.relatedAdrs.length > 0 && (
                        <p className="mb-1"><span className="text-muted">ADRs:</span> {detail.relatedAdrs.join(', ')}</p>
                      )}
                      {detail.relatedCode.length > 0 && (
                        <p className="mb-1"><span className="text-muted">Code:</span> {detail.relatedCode.join(', ')}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </AdminCard>
        </div>
      )}
    </div>
  );
}
