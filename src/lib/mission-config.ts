/**
 * Mission-Board + Artist-Funnel — Feature-Konstanten (ADR-039).
 *
 * CLIENT-SAFE: kein prisma-/fs-/server-Import (Client/Server-Boundary-Regel,
 * prozesse/pflicht/client-server-boundary.md). Client-Komponenten und
 * validations.ts duerfen diese Datei direkt importieren.
 *
 * Die String-Enums spiegeln die Prisma-Kommentare der Models Mission /
 * MissionAcceptance / ArtistApplication (SQLite-Konvention: String statt Enum).
 */

/** Missions-Typen — bestimmen die Darstellung auf dem Board (ADR-039). */
export const MISSION_TYPES = ['DONATION', 'RECRUITING', 'PARTNERSHIP', 'GOAL'] as const;
export type MissionType = (typeof MISSION_TYPES)[number];

/** Missions-Status — ARCHIVED ist der Soft-Delete (oeffentlich unsichtbar, 404). */
export const MISSION_STATUS = ['OPEN', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;
export type MissionStatus = (typeof MISSION_STATUS)[number];

/** Annahme-Status — COMPLETED setzt nur Flow im Admin (Erfuellungs-Anerkennung).
 *  Wieder-Annahme nach WITHDRAWN ist ein Update derselben Zeile (@@unique). */
export const ACCEPTANCE_STATUS = ['ACCEPTED', 'WITHDRAWN', 'COMPLETED'] as const;
export type AcceptanceStatus = (typeof ACCEPTANCE_STATUS)[number];

/** Bewerbungs-Status im Artist-Funnel — Uebergaenge pflegt Flow im Cockpit. */
export const APPLICATION_STATUS = ['PENDING', 'REVIEWED', 'ACCEPTED', 'DECLINED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUS)[number];

/**
 * Name der ENV-Variable fuer die Ziel-Adresse der Bewerbungs-Mail.
 *
 * NUR der Variablen-NAME lebt hier — der Fallback-Wert (4flow@kaboomkartell.com,
 * ADR-039) lebt ausschliesslich serverseitig in der API-Route
 * (src/app/api/artist-application/route.ts). Diese Datei ist client-safe und
 * wird gebundelt: die Adresse selbst darf hier NIEMALS auftauchen
 * (Harvester-Schutz, Adress-Leak-Check gegen .next/ ist ein Release-Blocker).
 */
export const ARTIST_APPLICATION_TO_ENV = 'ARTIST_APPLICATION_TO';

/**
 * Render-Guard fuer gespeicherte externe URLs (actionUrl, SocialAccount.url).
 *
 * zod (httpUrlSchema) sichert nur den Write-Pfad der API-Routen — Seed-Skripte
 * und Bestandsdaten umgehen ihn. Vor JEDEM Rendern als href gilt deshalb:
 * nur http:// und https:// werden zum Link, alles andere (javascript:, data:,
 * vbscript:, relative Pfade) faellt raus. Type-Guard: narrowt auf string.
 */
export function isSafeExternalUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// === Mission-i18n — Uebersetzungen der Inhalts-Felder (Mission.translations) ===

/**
 * Locales, die uebersetzt werden KOENNEN. EN ist bewusst NICHT dabei —
 * Englisch lebt in den Basisfeldern (title/summary/body/actionLabel),
 * das JSON traegt nur die Zusatz-Sprachen (ADR-031: en/de/es/fr).
 */
export const MISSION_TRANSLATION_LOCALES = ['de', 'es', 'fr'] as const;
export type MissionTranslationLocale = (typeof MISSION_TRANSLATION_LOCALES)[number];

/** Uebersetzbare Felder — jede Sprache darf jede Teilmenge liefern. */
export const MISSION_TRANSLATABLE_FIELDS = ['title', 'summary', 'body', 'actionLabel'] as const;
export type MissionTranslatableField = (typeof MISSION_TRANSLATABLE_FIELDS)[number];

export type MissionTranslationEntry = Partial<Record<MissionTranslatableField, string>>;
export type MissionTranslations = Partial<Record<MissionTranslationLocale, MissionTranslationEntry>>;

/** Aufgeloeste Anzeige-Texte einer Mission fuer EIN Locale. */
export interface MissionText {
  title: string;
  summary: string;
  body: string;
  actionLabel: string | null;
}

/**
 * Defensives Parsen des translations-JSON-Strings (Muster
 * parseApplicationLinks): kaputtes JSON, Arrays, Nicht-Objekte → {}.
 * Es werden NUR bekannte Locale-Keys (de/es/fr) und NUR string-Werte der
 * bekannten Felder uebernommen — Typ-Guard vor dem Renderer: Seeds oder
 * Alt-Daten koennen den zod-Write-Pfad umgangen haben, und ein Objekt/Array
 * an einer String-Position darf weder crashen noch ungeprueft in JSX landen
 * (body laeuft zusaetzlich durch renderMarkdown mit Link-Whitelist).
 */
export function parseMissionTranslations(raw: string | null | undefined): MissionTranslations {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

  const result: MissionTranslations = {};
  for (const locale of MISSION_TRANSLATION_LOCALES) {
    const entry = (parsed as Record<string, unknown>)[locale];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const clean: MissionTranslationEntry = {};
    for (const field of MISSION_TRANSLATABLE_FIELDS) {
      const value = (entry as Record<string, unknown>)[field];
      // Nur nicht-leere Strings zaehlen — '' waere ein "leerer" Override,
      // der den EN-Fallback stillschweigend ausblenden wuerde.
      if (typeof value === 'string' && value.trim() !== '') clean[field] = value;
    }
    if (Object.keys(clean).length > 0) result[locale] = clean;
  }
  return result;
}

/**
 * Loest die Anzeige-Texte einer Mission fuer das aktive Locale auf.
 * Feld-weiser Fallback auf die EN-Basisfelder: eine Teil-Uebersetzung
 * (z.B. nur title+summary auf DE) mischt sich mit dem englischen Rest.
 * 'en' und unbekannte Locales liefern die Basisfelder unveraendert.
 */
export function resolveMissionText(
  mission: {
    title: string;
    summary: string;
    body: string;
    actionLabel: string | null;
    translations?: string | null;
  },
  locale: string
): MissionText {
  const base: MissionText = {
    title: mission.title,
    summary: mission.summary,
    body: mission.body,
    actionLabel: mission.actionLabel,
  };
  if (!(MISSION_TRANSLATION_LOCALES as readonly string[]).includes(locale)) return base;

  const entry = parseMissionTranslations(mission.translations)[locale as MissionTranslationLocale];
  if (!entry) return base;
  return {
    title: entry.title ?? base.title,
    summary: entry.summary ?? base.summary,
    body: entry.body ?? base.body,
    actionLabel: entry.actionLabel ?? base.actionLabel,
  };
}

/**
 * Normalisiert ein Uebersetzungs-Objekt (zod-validiert) fuer die DB:
 * leere Strings/leere Sprachen fliegen raus, uebrig bleibt der JSON-String
 * oder null (= keine Uebersetzungen). Die API-Routen stringifizieren VOR
 * prisma — der Client sendet immer das OBJEKT (eine Richtung, ein Format).
 */
export function serializeMissionTranslations(
  input: MissionTranslations | null | undefined
): string | null {
  if (!input) return null;
  const clean: MissionTranslations = {};
  for (const locale of MISSION_TRANSLATION_LOCALES) {
    const entry = input[locale];
    if (!entry) continue;
    const cleanEntry: MissionTranslationEntry = {};
    for (const field of MISSION_TRANSLATABLE_FIELDS) {
      const value = entry[field];
      if (typeof value === 'string' && value.trim() !== '') cleanEntry[field] = value;
    }
    if (Object.keys(cleanEntry).length > 0) clean[locale] = cleanEntry;
  }
  return Object.keys(clean).length > 0 ? JSON.stringify(clean) : null;
}
