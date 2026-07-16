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
