/**
 * Zod Validierungs-Schemas
 * Werden sowohl client- als auch serverseitig verwendet.
 */

import { z } from 'zod';
import { ROLES, GENRES } from './constants';

// === Auth-Schemas ===

export const registerSchema = z.object({
  // "Public Name" — UI-Label v2.6 (vorher "Username"/"Artist Name").
  // Bleibt im Schema technisch `username` weil es im DB-Modell so heißt
  // und in URLs verwendet wird (z.B. /profile/{username}).
  username: z
    .string()
    .min(3, 'Public name must be at least 3 characters')
    .max(30, 'Public name must be at most 30 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Only letters, numbers, underscores and hyphens allowed'
    ),
  email: z
    .string()
    .email('Please enter a valid email address'),
  // Realer Name — Pflicht seit v2.6, nicht öffentlich sichtbar.
  realName: z
    .string()
    .min(2, 'Real name must be at least 2 characters')
    .max(120, 'Real name must be at most 120 characters'),
  // KBK-Passwort-Policy v2.5 (siehe auth-und-rollen/01-passwort-policy.md):
  //   min 12 Zeichen + 1 Lowercase + 1 Uppercase + 1 Digit + 1 Sonderzeichen.
  // Frontend zeigt einen Strength-Indicator + Generator-Button.
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a digit')
    .regex(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/~`"'\\]/, 'Password must contain a special character'),
  // Role wird seit v2.6 NICHT mehr vom User wählbar — alle starten als MITGLIED.
  // Promotion zu KUENSTLER/HELFER nur durch Admin via /admin/users.
  // Feld bleibt im Schema weil API rueckwaerts-kompatibel akzeptiert (default).
  role: z.enum([ROLES.MITGLIED, ROLES.KUENSTLER, ROLES.HELFER]).default(ROLES.MITGLIED),
  // Newsletter-Opt-In (v2.7) — User gibt explizites Consent das KBK ihn
  // anschreiben darf. Pflicht-Disclosure-Property für GDPR.
  newsletterOptIn: z.boolean().default(false),
});

export const loginSchema = z.object({
  // "Email or Public Name" seit v2.6 — Backend macht Email-Lookup zuerst,
  // dann Username-Fallback wenn keine "@" enthalten ist.
  loginIdentifier: z.string().min(1, 'Email or public name is required'),
  password: z.string().min(1, 'Password is required'),
});

// === Track-Schemas ===

// Track-Genre — optional, aber falls gesetzt MUSS es eines der 4 kanonischen
// KBK-Genres sein (GENRES in lib/constants.ts). Schützt vor Tippfehlern, die im
// Channel-/Pool-Match nicht greifen würden. Server bleibt tolerant für alte
// Tracks ohne Genre (Boomy-Cron-Backwards-Compat).
export const createTrackSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  genre: z.enum(GENRES).optional(),
  bpm: z.number().int().min(1).max(999).optional(),
  description: z.string().max(2000).optional(),
  artistId: z.string().optional(),
  // isPublic — Airplay-Gate. Default false, der Upload-Flow entscheidet.
  isPublic: z.boolean().optional(),
});

export const updateTrackSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  genre: z.enum(GENRES).optional(),
  bpm: z.number().int().min(1).max(999).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['DRAFT', 'POOL', 'PUBLISHED', 'ARCHIVED']).optional(),
  isPublic: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  aiDisclosure: z.enum(['human', 'ai_assisted', 'ai_generated']).optional().nullable(),
  aiSource: z.string().max(100).optional().nullable(),
});

// === Voting Schema ===
export const createVoteSchema = z.object({
  aura: z.boolean().default(false),
  sus: z.boolean().default(false),
  listenedSeconds: z.number().int().min(60, 'Listen at least 60 seconds before voting'),
});

// === SoundCloud Track-Schema ===

const SOUNDCLOUD_URL_REGEX = /^https?:\/\/(www\.)?soundcloud\.com\/.+\/.+/;

export const createSoundcloudTrackSchema = z.object({
  soundcloudUrl: z
    .string()
    .url('Please enter a valid URL')
    .regex(SOUNDCLOUD_URL_REGEX, 'Must be a valid SoundCloud URL (e.g. https://soundcloud.com/artist/track)'),
  title: z.string().min(1).max(200).optional(),
  genre: z.enum(GENRES).optional(),
  description: z.string().max(2000).optional(),
  artistId: z.string().optional(),
});

export type CreateSoundcloudTrackInput = z.infer<typeof createSoundcloudTrackSchema>;

// === Site-Settings Schema ===

// Twitch-Channel-Login (v2.30, ADR-005 Sektion E):
// 4–25 ASCII-Zeichen, Buchstaben/Zahlen/Underscore (Twitch-Doku).
// Leerer String oder null -> null in DB (= Channel deaktivieren).
const twitchChannelSchema = z
  .union([
    z.string().trim().regex(/^[a-zA-Z0-9_]{4,25}$/, 'Must be 4–25 letters/digits/underscores'),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    return v.toLowerCase();
  });

export const updateSettingsSchema = z.object({
  siteName: z.string().min(1).max(100).optional(),
  siteTagline: z.string().max(200).optional(),
  heroTitle: z.string().max(200).optional(),
  heroSubtitle: z.string().max(200).optional(),
  aboutText: z.string().max(5000).optional(),
  socialLinks: z.string().optional(), // JSON-String
  twitchChannel: twitchChannelSchema, // KBK-Channel für Live-Status
});

// === Release-Slot Schemas ===

export const createReleaseSlotSchema = z.object({
  scheduledDate: z.string().min(1, 'Date is required'),
  assigneeId: z.string().optional(),
  isBoomy: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});

export const updateReleaseSlotSchema = z.object({
  scheduledDate: z.string().optional(),
  assigneeId: z.string().optional().nullable(),
  isBoomy: z.boolean().optional(),
  status: z.enum(['OPEN', 'RESERVED', 'UPLOADED', 'APPROVED', 'PUBLISHED', 'EXPIRED']).optional(),
  trackId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type CreateReleaseSlotInput = z.infer<typeof createReleaseSlotSchema>;
export type UpdateReleaseSlotInput = z.infer<typeof updateReleaseSlotSchema>;

// === Radio-System Schemas ===

export const createPoolSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  genre: z.enum(GENRES).optional(),
  // Für externe Künstler: Pool gehört einem User (KUENSTLER-Rolle).
  // NULL = einer der 4 KBK-Default-Genre-Pools.
  ownerArtistId: z.string().optional().nullable(),
});

export const updatePoolSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  genre: z.enum(GENRES).optional().nullable(),
  isActive: z.boolean().optional(),
  ownerArtistId: z.string().optional().nullable(),
});

export const createTimetableSlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startHour: z.number().int().min(0).max(23),
  startMin: z.number().int().min(0).max(59).default(0),
  endHour: z.number().int().min(0).max(23),
  endMin: z.number().int().min(0).max(59).default(0),
  label: z.string().max(100).optional(),
  poolId: z.string().min(1, 'Pool is required'),
  priority: z.number().int().default(0),
  // Für "Wiederholen auf..."-Feature: mehrere Tage auf einmal
  repeatDays: z.array(z.number().int().min(0).max(6)).optional(),
});

export const createTimetableEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(1000).optional(),
  startTime: z.string().datetime({ message: 'Invalid date' }),
  endTime: z.string().datetime({ message: 'Invalid date' }),
  eventType: z.enum(['POOL', 'YOUTUBE', 'TWITCH']).default('POOL'),
  poolId: z.string().optional(),
  streamUrl: z.string().url('Ungültige URL').optional(),
  // v2.31: Subgenre-Override (analog TimetableSlot.subgenre). Erlaubte Werte:
  // "raggatek" (im Hardtek-Channel), "brazilian-phonk" (im Phonk-Channel).
  // Leer/null = kein Theme-Override. Wenn gesetzt, schaltet useChannelAccent
  // auf die Akzent-Kontrastfarbe um (Hardtek-Slot mit raggatek → grüner Akzent
  // statt gelb).
  subgenre: z
    .union([z.enum(['raggatek', 'brazilian-phonk']), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' || v === null || v === undefined ? null : v)),
  // ADR-028: Wiederkehrendes Event. null/weggelassen = einmalig (startTime/endTime
  // absolut), 0-6 = jede Woche an diesem Wochentag (nur die Uhrzeit aus
  // startTime/endTime gilt).
  recurringDayOfWeek: z
    .union([z.number().int().min(0).max(6), z.null()])
    .optional()
    .transform((v) => (v === null || v === undefined ? null : v)),
});

export type CreatePoolInput = z.infer<typeof createPoolSchema>;
export type UpdatePoolInput = z.infer<typeof updatePoolSchema>;
export type CreateTimetableSlotInput = z.infer<typeof createTimetableSlotSchema>;
export type CreateTimetableEventInput = z.infer<typeof createTimetableEventSchema>;

// === Typen aus Schemas ===

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateTrackInput = z.infer<typeof createTrackSchema>;
export type UpdateTrackInput = z.infer<typeof updateTrackSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
