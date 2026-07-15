/**
 * Externe Marken- und Kontakt-Links — zentrale Quelle (client-safe).
 *
 * EINE Stelle für GitHub-Repo, Kontakt-Mail und die Social-Profile. Konsumiert
 * vom Footer (SiteFooter) und der Socials-Sektion (SocialsSection). Icons bleiben
 * bewusst in den Komponenten (ReactNodes gehören nicht in die Daten-Datei) — das
 * Mapping läuft über die `id`. Keine Server-Imports, damit Client-Komponenten die
 * Datei gefahrlos ziehen können.
 */

import { DISCORD_INVITE_URL } from './constants';

/** Öffentliches Quellcode-Repo (v1.0 source-available). */
export const GITHUB_REPO_URL = 'https://github.com/FlorianWinkler1248/kaboomkartell';

/** Öffentlicher MCP-Server (Model Context Protocol) — von KI-Agenten nutzbar. */
export const MCP_PAGE_PATH = '/mcp';

/** Kontakt-Adresse (Impressum + Footer). Real erreichbare Mailbox. */
export const CONTACT_EMAIL = '4flow@kaboomkartell.com';

export type SocialId = 'soundcloud' | 'instagram' | 'tiktok' | 'discord';

export interface SocialLink {
  id: SocialId;
  label: string;
  handle: string;
  href: string;
  /** Akzentfarbe (Hex) — Karten-Frame + Icon. */
  color: string;
}

// Rasta-Palette (spiegelt die Root-Spec — hier bewusst als Literale, damit die
// Datei client-safe und frei von UI-Style-Imports bleibt).
const GREEN = '#3FCF4A';
const RED = '#E63B2E';
const YELLOW = '#F5D02E';

/**
 * Live-Social-Profile von 4Flow / KaboomKartell. YouTube + Twitch bewusst raus
 * (keine aktiven Accounts). Reihenfolge = Anzeige-Reihenfolge.
 */
export const SOCIAL_LINKS: readonly SocialLink[] = [
  { id: 'soundcloud', label: 'SOUNDCLOUD', handle: '4flow-official', href: 'https://soundcloud.com/4-flow', color: YELLOW },
  { id: 'instagram', label: 'INSTAGRAM', handle: '@4flow_music', href: 'https://www.instagram.com/4flow_music', color: RED },
  { id: 'tiktok', label: 'TIKTOK', handle: '@phonkby4flow', href: 'https://www.tiktok.com/@phonkby4flow', color: GREEN },
  { id: 'discord', label: 'DISCORD', handle: 'kaboomkartell', href: DISCORD_INVITE_URL, color: YELLOW },
] as const;
