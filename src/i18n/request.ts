import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './config';

/**
 * next-intl ohne i18n-Routing (ADR-031): das Locale kommt aus dem
 * kbk-locale-Cookie, nicht aus der URL. Kein Cookie / unbekannter Wert
 * → Default Englisch. Message-Kataloge liegen unter messages/<locale>.json.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
