/**
 * App-weite Konstanten
 * Zentrale Stelle für Rollen, Status-Werte und Konfiguration.
 */

// === Benutzer-Rollen ===
export const ROLES = {
  MITGLIED: 'MITGLIED',
  KUENSTLER: 'KUENSTLER',
  HELFER: 'HELFER',
  ADMIN: 'ADMIN',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// Rollen für die Registrierung (ADMIN kann man sich nicht selbst geben)
export const REGISTERABLE_ROLES = [
  { value: ROLES.MITGLIED, label: 'Member' },
  { value: ROLES.KUENSTLER, label: 'Artist' },
  { value: ROLES.HELFER, label: 'Helper' },
] as const;

// === Track-Typen ===
export const TRACK_TYPES = {
  LOCAL: 'LOCAL',
  SOUNDCLOUD: 'SOUNDCLOUD',
} as const;

export type TrackType = (typeof TRACK_TYPES)[keyof typeof TRACK_TYPES];

// === Track-Status ===
export const TRACK_STATUS = {
  DRAFT: 'DRAFT',
  POOL: 'POOL',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;

// === AI-Disclosure Werte ===
export const AI_DISCLOSURE = {
  HUMAN: 'human',
  AI_ASSISTED: 'ai_assisted',
  AI_GENERATED: 'ai_generated',
} as const;

export type AiDisclosure = (typeof AI_DISCLOSURE)[keyof typeof AI_DISCLOSURE];

export const AI_DISCLOSURE_LABELS: Record<string, string> = {
  human: 'Human Made',
  ai_assisted: 'AI Assisted',
  ai_generated: 'AI Generated',
};

// Kurz-Labels für aiDisclosure (Buttons, Pills) — Lang-Form: AI_DISCLOSURE_LABELS.
export const AI_DISCLOSURE_SHORT: Record<string, string> = {
  human: 'Human',
  ai_assisted: 'Hybrid',
  ai_generated: 'AI',
};

// Boomy-Lila — Cover-Akzent. Boomy-only-Tracks bekommen reines Boomy-Lila,
// Hybride die Genre-Farbe plus diese Farbe als Zweit-Akzent (Dual-Accent-Sprite),
// rein menschliche Tracks nur die Genre-Farbe. Die 3-Wege-Logik sitzt in
// accentForTrack (api/admin/cover-regenerate).
export const BOOMY_PURPLE = '#8B5CF6';

// === Release-Slot Status ===
export const SLOT_STATUS = {
  OPEN: 'OPEN',
  RESERVED: 'RESERVED',
  UPLOADED: 'UPLOADED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  EXPIRED: 'EXPIRED',
} as const;

export type SlotStatus = (typeof SLOT_STATUS)[keyof typeof SLOT_STATUS];

export const SLOT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  RESERVED: 'Reserved',
  UPLOADED: 'Uploaded',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  EXPIRED: 'Expired',
};

// === Release-Kalender Konfiguration ===
//
// Secret kommt jetzt VERPFLICHTEND aus dem Environment. Kein Klartext-Default
// mehr (war ein Repo-leakable Secret) — production-Builds crashen beim ersten
// Endpoint-Aufruf, wenn die Env-Var fehlt. Dev-Mode bekommt einen Fallback,
// der explizit "DO NOT USE IN PROD" enthält, damit sich niemand drauf verlässt.
function getRequiredSecret(name: string): string {
  const val = process.env[name];
  if (val) return val;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`[security] Required secret "${name}" is not set in environment.`);
  }
  return `dev-fallback-${name}-DO-NOT-USE-IN-PROD`;
}

export const RELEASE_CONFIG = {
  maxSlotsPerDay: 3,
  get autoPublishSecret() {
    return getRequiredSecret('RELEASE_AUTO_PUBLISH_SECRET');
  },
};

// === Voting-System ===
export const VOTING_CONFIG = {
  minListenSeconds: 60,    // Mindestens 60s hören bevor Voting freigeschaltet
  susThreshold: 80,        // Ab 80% sus-Votes: "Likely AI" Badge
} as const;

export type TrackStatus = (typeof TRACK_STATUS)[keyof typeof TRACK_STATUS];

// === Genre-System (Pool-Restrukturierung 16.05.2026) ===
// KBK hat genau 4 Content-Genres — jedes Genre entspricht genau einem Pool.
// Dies ist die EINE kanonische Genre-Liste; frühere Mehrfach-Definitionen
// (BOOMY_GENRES, TRACK_GENRES, alte APP_CONFIG.genres mit Frenchcore/Tribe)
// sind hier zusammengeführt.
export const GENRES = ['Phonk', 'Hardtek', 'Raggatek', 'Brazilian Phonk'] as const;
export type Genre = (typeof GENRES)[number];

export function isGenre(value: unknown): value is Genre {
  return typeof value === 'string' && (GENRES as readonly string[]).includes(value);
}

// Akzentfarbe pro Genre — steuert Cover-Generierung und UI-Akzente.
// Raggatek und Brazilian Phonk teilen sich Grün (Special-Theme-Farbe).
export const GENRE_ACCENT: Record<Genre, string> = {
  Phonk: '#E63B2E',             // rot
  Hardtek: '#F5D02E',           // gelb
  Raggatek: '#3FCF4A',          // grün
  'Brazilian Phonk': '#3FCF4A', // grün
};

// Radio-Channel pro Genre. KBK sendet auf 2 Channel-Tabs (phonk, hardtek).
// Raggatek läuft im Hardtek-Tab, Brazilian Phonk im Phonk-Tab — jeweils als
// Special-Theme mit grünem Akzent (siehe useChannelAccent / TimetableSlot.subgenre).
export const GENRE_CHANNEL: Record<Genre, 'phonk' | 'hardtek'> = {
  Phonk: 'phonk',
  'Brazilian Phonk': 'phonk',
  Hardtek: 'hardtek',
  Raggatek: 'hardtek',
};

// Subgenre-Theme-Override pro Genre — nur die "Neben"-Genres eines Channels
// brauchen einen Override (Raggatek im Hardtek-Channel, Brazilian Phonk im
// Phonk-Channel). Phonk/Hardtek sind die Channel-Hauptgenres → kein Override.
export const GENRE_SUBGENRE: Record<Genre, 'raggatek' | 'brazilian-phonk' | null> = {
  Phonk: null,
  Hardtek: null,
  Raggatek: 'raggatek',
  'Brazilian Phonk': 'brazilian-phonk',
};

// Slug des KBK-Content-Pools für ein Genre (genau 4 Pools, ownerArtistId=null).
// "Brazilian Phonk" → "brazilian-phonk".
export function genrePoolSlug(genre: string): string {
  return genre.trim().toLowerCase().replace(/\s+/g, '-');
}

// Subgenre-Theme eines Genres (case-tolerant). Raggatek → 'raggatek',
// Brazilian Phonk → 'brazilian-phonk', Phonk/Hardtek → null.
export function genreSubgenre(genre: string | null | undefined): 'raggatek' | 'brazilian-phonk' | null {
  if (!genre) return null;
  const match = (Object.keys(GENRE_SUBGENRE) as Genre[]).find(
    (g) => g.toLowerCase() === genre.toLowerCase(),
  );
  return match ? GENRE_SUBGENRE[match] : null;
}

// === App-Konfiguration ===
export const APP_CONFIG = {
  name: 'KaboomKartell',
  shortName: 'KBK',
  tagline: 'Digital Music Label by 4Flow',
  founder: '4Flow',
  genres: GENRES,

  // Upload-Limits
  maxFileSize: 50 * 1024 * 1024, // 50 MB
  allowedAudioTypes: ['audio/mpeg', 'audio/mp3'],
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],

  // Pagination
  defaultPageSize: 20,
  maxPageSize: 100,
} as const;

// === Discord-Community ===
// Öffentlicher Invite-Link des KBK-Discord-Servers (kein Secret). Von Flow im
// Server erstellt: "Einladung erstellen" → "Bearbeiten" → "Läuft nie ab".
// Verlinkt im Hero-CTA und in der Socials-Sektion.
export const DISCORD_INVITE_URL = 'https://discord.gg/nrvuW7aB';

// === Playlist-Typen ===
// 'showcase' (ADR-041): manuell kuratierte Schaufenster-Playlist für externe
// Künstler — darf SOUNDCLOUD-Tracks enthalten, wird von der Auto-Rotation
// ignoriert (rotate-playlists verarbeitet nur *-rotation-Typen) und erscheint
// prominent auf Homepage + /playlists. Radio-Airplay bleibt davon unberührt
// (mapPoolTracks filtert auf LOCAL).
export const PLAYLIST_TYPES = {
  MANUAL: 'manual',
  SHOWCASE: 'showcase',
  WEEKLY_ROTATION: 'weekly-rotation',
  MONTHLY_ROTATION: 'monthly-rotation',
  GENRE_ROTATION: 'genre-rotation',
} as const;

export type PlaylistType = (typeof PLAYLIST_TYPES)[keyof typeof PLAYLIST_TYPES];

export const PLAYLIST_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual',
  showcase: 'Showcase',
  'weekly-rotation': 'Weekly Rotation',
  'monthly-rotation': 'Monthly Rotation',
  'genre-rotation': 'Genre Rotation',
};

// SoundCloud-Signalfarbe — nur für Showcase-/Embed-Flächen (externe Inhalte),
// nicht Teil der KBK-Genre-Palette.
export const SOUNDCLOUD_ORANGE = '#FF5500';

// === Repeat-Modi (für den Player) ===
export const REPEAT_MODES = ['off', 'all', 'one'] as const;
export type RepeatMode = (typeof REPEAT_MODES)[number];

// === Bot/KI-User Erkennung ===
// Konventionsbasiert: Kein DB-Feld nötig, einfach erweiterbar.
// Später bei Bedarf durch ein isBot-Feld im User-Model ersetzbar.
export const BOT_USERNAMES = new Set(['boomy']);

// Boomy-Konfiguration (KI-Resident Artist)
// autoPublishSecret kommt verpflichtend aus dem Environment (kein Code-Default).
export const BOOMY_CONFIG = {
  username: 'boomy',
  defaultAiDisclosure: AI_DISCLOSURE.AI_GENERATED,
  defaultAiSource: 'suno',
  get autoPublishSecret() {
    return getRequiredSecret('BOOMY_AUTO_PUBLISH_SECRET');
  },
  // Release-Pipeline: alle 2 Tage macht Boomy einen seiner noch nicht
  // öffentlichen AI-Tracks (aiDisclosure='ai_generated', isPublic=false) public.
  releaseIntervalDays: 2,
  // Schwelle für Pool-Status-Alarm: weniger als 4 wartende AI-Tracks = Warnung.
  poolLowThreshold: 4,
};

// === Radio-System ===
export const RADIO_CONFIG = {
  // Schedule-Poll alle 15s. MUSS < VOTE_CLOSE_LEAD_MS (fest 20s, radio-state.ts)
  // bleiben — so erhält der Client den gelockten Crowd-Control-Gewinner garantiert
  // vor dem Track-Ende (sonst greift die schedule-getriebene Übergabe ohne nextTrack,
  // ADR-026). Radio Sync v2: der eigentliche Sync läuft kontinuierlich lokal
  // (controlTickMs), nicht am Poll — der Poll liefert nur die autoritative Zeitlinie.
  pollIntervalMs: 15_000,
  controlTickMs: 1_000,         // PLL-Regelkreis-Takt (Beatmatch), rein client-lokal
  crowdControlPollMs: 9_000,    // Live-Vote-Tally-Poll des Crowd-Control-Widgets
  // Radio Sync v3 (ADR-040): Voll-Blob-Preload des gelockten nächsten Tracks.
  // Kill-Switch Stufe 1: auf false setzen → Ghost-Preloader-Pfad (im Code erhalten).
  blobPreloadEnabled: true,
  // Preload-Start verzögern (Join-Bandbreiten-Kollision vermeiden: Stream des
  // laufenden Tracks nicht mit dem N+1-Voll-Download überlappen lassen).
  preloadDelayMs: 10_000,
  minPoolDurationMinutes: 30,   // Warnung wenn Pool kürzer als 30 Minuten
} as const;

export const EVENT_TYPES = {
  POOL: 'POOL',
  YOUTUBE: 'YOUTUBE',
  TWITCH: 'TWITCH',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export const EVENT_TYPE_LABELS: Record<string, string> = {
  POOL: 'Pool Rotation',
  YOUTUBE: 'YouTube Live',
  TWITCH: 'Twitch Live',
};

// Wochentage für Timetable (Sonntag = 0, wie JS Date.getDay())
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function isBotUser(username: string): boolean {
  return BOT_USERNAMES.has(username.toLowerCase());
}

/**
 * Prüft den Boomy Secret-Key aus dem Authorization-Header.
 * Wird von Auto-Publish und Playlist-Rotation genutzt.
 *
 * Nutzt timing-safe Vergleich, damit Side-Channel-Attacks (Timing-Oracle
 * über String-Equality) nicht das Secret byte-für-byte rekonstruieren können.
 */
import { timingSafeEqual } from 'crypto';

export function validateBoomySecret(authHeader: string | null): boolean {
  if (!authHeader) return false;
  try {
    const a = Buffer.from(authHeader);
    const b = Buffer.from(BOOMY_CONFIG.autoPublishSecret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
