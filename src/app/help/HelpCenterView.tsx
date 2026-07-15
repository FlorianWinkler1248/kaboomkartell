'use client';

/**
 * HelpCenterView — öffentliche Prozess-Bibliothek (/help).
 *
 * Client-Gegenstück zur Admin-ProcessLibraryView, aber in der Obsidian-Optik der
 * öffentlichen Seiten (keine Admin-UI-Primitiven) und gegen die public API
 * /api/processes (nur end-user-Workflows). Markdown + Mermaid kommen aus dem
 * geteilten Modul `@/lib/process-markdown`.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, X, Globe, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ensureMermaid, renderMarkdown } from '@/lib/process-markdown';

type Lang = 'en' | 'de';

interface ListItem {
  id: string;
  title: string;
  summary: string;
  hasEn: boolean;
  hasMermaid: boolean;
}

interface DetailItem {
  id: string;
  title: string;
  titleDe: string;
  summary: string;
  summaryDe: string;
  hasEn: boolean;
  requestedLang: Lang;
  actualLang: 'en' | 'de' | 'de-fallback';
  body: string;
}

export default function HelpCenterView() {
  const t = useTranslations('help');
  const [lang, setLang] = useState<Lang>('en');
  const [items, setItems] = useState<ListItem[]>([]);
  const [loadedLang, setLoadedLang] = useState<Lang | null>(null);
  const [error, setError] = useState(false);
  const loading = loadedLang !== lang;

  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailItem | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [detailError, setDetailError] = useState(false);
  const detailLoading = activeId !== null && detailKey !== `${activeId}:${lang}`;
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/processes?lang=${lang}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.success) {
          setError(true);
        } else {
          setItems(data.items);
          setError(false);
        }
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoadedLang(lang));
    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetch(`/api/processes/${activeId}?lang=${lang}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.success) {
          setDetailError(true);
        } else {
          setDetail(data.process);
          setDetailError(false);
        }
      })
      .catch(() => !cancelled && setDetailError(true))
      .finally(() => !cancelled && setDetailKey(`${activeId}:${lang}`));
    return () => {
      cancelled = true;
    };
  }, [activeId, lang]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q
      ? items.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.summary.toLowerCase().includes(q),
        )
      : items;
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
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
            // Render-Fehler: Code-Block bleibt sichtbar als Fallback
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
    setActiveId(null);
    setDetail(null);
    setDetailKey(null);
    setDetailError(false);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeId, onClose]);

  return (
    <div>
      {/* Toolbar: Suche + Sprach-Toggle */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.4)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="kbk-obsidian polished"
            style={{
              width: '100%',
              padding: '10px 12px 10px 34px',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: '#fff',
              border: 'none',
              outline: 'none',
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => setLang(lang === 'en' ? 'de' : 'en')}
          title={t('langToggleTitle')}
          className="kbk-obsidian polished"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 14px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.8)',
            cursor: 'pointer',
            border: 'none',
          }}
        >
          <Globe size={14} />
          {lang.toUpperCase()}
        </button>
      </div>

      {loading && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.5)', padding: '32px 0', textAlign: 'center' }}>
          {t('loading')}
        </p>
      )}

      {error && (
        <div className="kbk-obsidian framed kbk-frame-red" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertCircle size={16} style={{ color: '#E63B2E', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{t('loadError')}</span>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && items.length === 0 && (
        <div className="kbk-obsidian framed" style={{ padding: 28, textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: '#fff', letterSpacing: '0.1em', margin: '0 0 8px' }}>{t('emptyTitle')}</h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>{t('emptyBody')}</p>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && items.length > 0 && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.5)', padding: '24px 0', textAlign: 'center' }}>
          {t('noMatches')}
        </p>
      )}

      {/* Karten-Liste */}
      <div className="kbk-subpage-grid-2">
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveId(item.id)}
            className="kbk-obsidian framed kbk-card-hover"
            style={{
              padding: 18,
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              border: 'none',
              color: 'inherit',
            }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>
              {item.title}
            </span>
            {item.summary && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55 }}>
                {item.summary}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Detail-Modal */}
      {activeId && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            className="kbk-obsidian"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 900,
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: 18, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: '#3FCF4A', letterSpacing: '0.06em', margin: 0 }}>
                {detail?.title || t('loading')}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('close')}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 4, flexShrink: 0 }}
              >
                <X size={18} />
              </button>
            </div>
            <div ref={modalRef} style={{ overflowY: 'auto', padding: 18 }}>
              {detailLoading && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{t('loading')}</p>
              )}
              {!detailLoading && detailError && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#E63B2E' }}>{t('loadError')}</p>
              )}
              {detail && (
                <>
                  {detail.actualLang === 'de-fallback' && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, marginBottom: 14, background: 'rgba(245,208,46,0.1)', border: '1px solid rgba(245,208,46,0.4)', borderRadius: 8 }}>
                      <AlertCircle size={14} style={{ color: '#F5D02E', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#F5D02E' }}>{t('deFallbackNote')}</span>
                    </div>
                  )}
                  {detail.summary && (
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontStyle: 'italic', color: 'rgba(255,255,255,0.6)', borderLeft: '2px solid rgba(63,207,74,0.4)', paddingLeft: 12, marginBottom: 16 }}>
                      {detail.summary}
                    </p>
                  )}
                  <article
                    className="prose prose-invert max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: renderedBody.html }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
