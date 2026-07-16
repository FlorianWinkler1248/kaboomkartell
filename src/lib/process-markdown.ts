/**
 * Prozess-Markdown-Renderer (geteilt, CLIENT-ONLY).
 *
 * Mini-Inline-Parser (Headings, Listen, Tabellen, Code, Inline-Code, Links) ohne
 * externe Markdown-Dependency — XSS-safe via `escapeHtml`. Mermaid-Diagramme werden
 * lazy vom CDN nachgeladen (`ensureMermaid`), nicht gebündelt.
 *
 * Geteilt von der Admin-Prozess-Bibliothek (ProcessLibraryView) und dem öffentlichen
 * Hilfe-Center (HelpCenterView) — EINE Quelle statt zweier Kopien. Nutzt `window`/
 * `document`, also nur aus Client-Komponenten importieren.
 */

declare global {
  interface Window {
    mermaid?: {
      initialize: (config: Record<string, unknown>) => void;
      run: (config?: { querySelector?: string; nodes?: NodeListOf<Element> }) => Promise<void>;
    };
  }
}

let mermaidLoaderPromise: Promise<void> | null = null;

/** Lädt Mermaid einmalig vom CDN (idempotent). Rejected, wenn das CDN unerreichbar ist. */
export function ensureMermaid(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.mermaid) return Promise.resolve();
  if (mermaidLoaderPromise) return mermaidLoaderPromise;

  mermaidLoaderPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
    script.onload = () => {
      window.mermaid?.initialize({
        startOnLoad: false,
        theme: 'dark',
        flowchart: { useMaxWidth: true, htmlLabels: true },
        securityLevel: 'strict',
      });
      resolve();
    };
    script.onerror = () => reject(new Error('Mermaid CDN unreachable'));
    document.head.appendChild(script);
  });
  return mermaidLoaderPromise;
}

/** HTML-Escaping — Pflicht-Vorstufe vor jedem `dangerouslySetInnerHTML`. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Mini Markdown→HTML Renderer (kein npm-Marked, keine Cross-File-Risiken).
 *  Mermaid-Code-Blöcke werden in `mermaidBlocks` gesammelt und als `<pre class="mermaid">`
 *  ausgegeben (der Aufrufer lässt sie via {@link ensureMermaid} rendern). */
export function renderMarkdown(md: string, mermaidBlocks: string[]): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inCode: string | null = null;
  let codeBuf: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (!inTable) return;
    if (tableRows.length === 0) {
      inTable = false;
      return;
    }
    const [head, ...rest] = tableRows;
    const body = rest.filter((row) => !row.every((c) => /^[-:\s]+$/.test(c)));
    out.push('<div class="overflow-x-auto my-3"><table class="min-w-full text-sm border-collapse">');
    out.push(
      '<thead class="bg-elevated/60"><tr>' +
        head.map((c) => `<th class="border border-border px-3 py-1.5 text-left font-medium">${inlineMd(c)}</th>`).join('') +
        '</tr></thead>',
    );
    out.push('<tbody>');
    for (const row of body) {
      out.push(
        '<tr class="hover:bg-elevated/30">' +
          row.map((c) => `<td class="border border-border px-3 py-1.5 align-top">${inlineMd(c)}</td>`).join('') +
          '</tr>',
      );
    }
    out.push('</tbody></table></div>');
    inTable = false;
    tableRows = [];
  };

  const inlineMd = (s: string): string => {
    let escaped = escapeHtml(s);
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-elevated text-rasta-yellow text-xs">$1</code>');
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Schema-Whitelist gegen javascript:/data:-URLs (Defense-in-Depth, 16.07.2026):
    // erlaubt sind http(s), mailto und relative Pfade (/... oder #...). Alles andere
    // wird als reiner Text gerendert — kuenftige Renderer-Konsumenten (Mission-Board,
    // Boomy-Quellen) erben die Absicherung automatisch.
    escaped = escaped.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, label: string, href: string) => {
        const url = href.trim();
        const isSafe =
          /^(https?:\/\/|mailto:)/i.test(url) ||
          url.startsWith('#') ||
          (url.startsWith('/') && !url.startsWith('//')); // kein protocol-relative //evil.com
        if (!isSafe) return label;
        return `<a href="${url}" class="text-rasta-green hover:underline" target="_blank" rel="noopener">${label}</a>`;
      },
    );
    return escaped;
  };

  let inList: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (inList) {
      out.push(inList === 'ul' ? '</ul>' : '</ol>');
      inList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inCode !== null) {
      if (line.trim() === '```') {
        const code = codeBuf.join('\n');
        if (inCode === 'mermaid') {
          const idx = mermaidBlocks.length;
          mermaidBlocks.push(code);
          out.push(`<div class="mermaid-block my-4 p-3 bg-elevated/40 rounded-lg overflow-x-auto" data-mermaid-idx="${idx}"><pre class="mermaid">${escapeHtml(code)}</pre></div>`);
        } else {
          out.push(`<pre class="my-3 p-3 bg-elevated/60 rounded-lg overflow-x-auto text-xs"><code>${escapeHtml(code)}</code></pre>`);
        }
        inCode = null;
        codeBuf = [];
      } else {
        codeBuf.push(line);
      }
      continue;
    }

    const codeOpen = line.match(/^```\s*(\w+)?/);
    if (codeOpen) {
      flushTable();
      closeList();
      inCode = (codeOpen[1] || 'plain').toLowerCase();
      continue;
    }

    if (line.match(/^\s*\|.+\|\s*$/)) {
      closeList();
      const cells = line
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map((c) => c.trim());
      if (!inTable) inTable = true;
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      const sizeClass = level === 1 ? 'text-2xl mt-6 mb-3' : level === 2 ? 'text-xl mt-5 mb-2' : level === 3 ? 'text-lg mt-4 mb-2' : 'text-base mt-3 mb-2';
      out.push(`<h${level} class="font-semibold ${sizeClass}">${inlineMd(headingMatch[2])}</h${level}>`);
      continue;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulMatch) {
      if (inList !== 'ul') {
        closeList();
        out.push('<ul class="list-disc list-inside space-y-1 my-2 pl-2">');
        inList = 'ul';
      }
      out.push(`<li>${inlineMd(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList !== 'ol') {
        closeList();
        out.push('<ol class="list-decimal list-inside space-y-1 my-2 pl-2">');
        inList = 'ol';
      }
      out.push(`<li>${inlineMd(olMatch[1])}</li>`);
      continue;
    }

    if (line.trim() === '') {
      closeList();
      continue;
    }

    closeList();
    out.push(`<p class="my-2 leading-relaxed">${inlineMd(line)}</p>`);
  }

  flushTable();
  closeList();
  if (inCode !== null) {
    out.push(`<pre class="my-3 p-3 bg-elevated/60 rounded-lg overflow-x-auto text-xs"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  }
  return out.join('\n');
}
