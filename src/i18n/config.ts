/**
 * i18n-Grundkonstanten — client-safe (keine Server-Imports!).
 *
 * Cookie-basiertes Locale ohne URL-Routing (ADR-031): bestehende URLs
 * bleiben stabil, die Sprache wechselt per Switcher + Cookie. Default ist
 * Englisch (internationale Lingua franca, auch für MCP/llms.txt).
 *
 * Markenbegriffe werden NIE übersetzt: KaboomKartell, Wolfpack, AURA+, SUS,
 * Boomy, „Make Noise Together", Phonk/Hardtek/Raggatek/Brazilian Phonk.
 */

export const LOCALES = ['en', 'de', 'fr', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'kbk-locale';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
};

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
