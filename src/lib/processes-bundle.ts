/**
 * Prozess-Bundle-Loader (Laufzeit, nicht Build-Import).
 *
 * Das Bundle (`src/data/processes-bundle.json`) ist server-resident: Es enthaelt
 * interne Prozess-Beschreibungen und liegt bewusst NICHT im oeffentlichen Repo.
 * Auf dem Server wird es per Symlink aus `data/` bereitgestellt (analog zu
 * `public/uploads`), lokal vom `prebuild` aus dem Brain generiert.
 *
 * Deshalb wird es zur Laufzeit per `fs` gelesen statt statisch importiert — ein
 * statischer `import … from '…json'` wuerde jeden Build ohne die Datei brechen
 * (CI hat weder Brain noch Symlink). Fehlt die Datei, ist die Prozess-Bibliothek
 * leer statt eines Crashes.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface ProcessEntry {
  id: string;
  idRaw: string;
  module: string;
  relPath: string;
  frontmatter: Record<string, unknown>;
  bodyDe: string;
  bodyEn: string | null;
}

export interface ProcessesBundle {
  generatedAt: string;
  count: number;
  countWithEn: number;
  processes: ProcessEntry[];
}

const EMPTY: ProcessesBundle = { generatedAt: '', count: 0, countWithEn: 0, processes: [] };
let cached: ProcessesBundle | null = null;

export function loadProcessesBundle(): ProcessesBundle {
  if (cached) return cached;
  try {
    const p = path.join(process.cwd(), 'src', 'data', 'processes-bundle.json');
    cached = JSON.parse(fs.readFileSync(p, 'utf8')) as ProcessesBundle;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

// ----------------------------------------------------------------------------
// Sichtbarkeit + Mapper (geteilt von Admin- und Public-Prozess-Routen)
// ----------------------------------------------------------------------------

/** Audiences, die ein Workflow tragen muss, um im ÖFFENTLICHEN Hilfe-Center zu
 *  erscheinen. Der Admin sieht alles; die public `/api/processes`-Route filtert
 *  server-seitig hierauf (nie nur im Frontend — sonst leaken interne Workflows). */
export const PUBLIC_PROCESS_AUDIENCES = ['end-user'] as const;

/** Ist dieser Workflow für das öffentliche Hilfe-Center freigegeben? */
export function isPublicProcess(entry: ProcessEntry): boolean {
  const audiences = (entry.frontmatter.audiences as string[] | undefined) ?? [];
  return audiences.some((a) => (PUBLIC_PROCESS_AUDIENCES as readonly string[]).includes(a));
}

export interface ProcessListItem {
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

export interface ProcessDetail {
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

/** Formt einen Bundle-Eintrag in ein Listen-Item (ohne Body). EN mit DE-Fallback
 *  auf Titel-/Summary-Ebene. Geteilt von Admin- und Public-Prozess-Liste. */
export function toProcessListItem(entry: ProcessEntry, lang: 'en' | 'de'): ProcessListItem {
  const fm = entry.frontmatter;
  const titleEn = (fm.title_en as string) || (fm.name as string) || entry.id;
  const summaryEn = (fm.summary_en as string) || (fm.summary as string) || '';
  const titleDe = (fm.name as string) || entry.id;
  const summaryDe = (fm.summary as string) || '';
  return {
    id: entry.id,
    idRaw: entry.idRaw,
    module: entry.module,
    title: lang === 'en' ? titleEn : titleDe,
    summary: lang === 'en' ? summaryEn : summaryDe,
    audiences: (fm.audiences as string[]) || [],
    status: (fm.status as string) || 'draft',
    tier: (fm.tier as string) || 'nice-to-have',
    lastReviewed: (fm.last_reviewed as string) || null,
    hasEn: !!entry.bodyEn,
    hasMermaid: entry.bodyDe.includes('```mermaid'),
  };
}

/** Formt einen Bundle-Eintrag in die Detail-Ansicht inkl. Body. EN-Anfrage ohne
 *  bodyEn liefert den DE-Body mit actualLang='de-fallback' (Frontend-Badge). */
export function toProcessDetail(entry: ProcessEntry, requestedLang: 'en' | 'de'): ProcessDetail {
  let body: string;
  let actualLang: 'en' | 'de' | 'de-fallback';
  if (requestedLang === 'en') {
    if (entry.bodyEn) {
      body = entry.bodyEn;
      actualLang = 'en';
    } else {
      body = entry.bodyDe;
      actualLang = 'de-fallback';
    }
  } else {
    body = entry.bodyDe;
    actualLang = 'de';
  }
  const fm = entry.frontmatter;
  return {
    id: entry.id,
    idRaw: entry.idRaw,
    module: entry.module,
    relPath: entry.relPath,
    title: (fm.title_en as string) || (fm.name as string) || entry.id,
    titleDe: (fm.name as string) || entry.id,
    summary: (fm.summary_en as string) || (fm.summary as string) || '',
    summaryDe: (fm.summary as string) || '',
    audiences: (fm.audiences as string[]) || [],
    status: (fm.status as string) || 'draft',
    tier: (fm.tier as string) || 'nice-to-have',
    lastReviewed: (fm.last_reviewed as string) || null,
    validation: (fm.validation as string) || null,
    relatedWorkflows: (fm.related_workflows as string[]) || [],
    relatedAdrs: (fm.related_adrs as string[]) || [],
    relatedCode: (fm.related_code as string[]) || [],
    readWhen: (fm.read_when as string[]) || [],
    visualisierung: (fm.visualisierung as string) || null,
    hasEn: !!entry.bodyEn,
    requestedLang,
    actualLang,
    body,
  };
}
