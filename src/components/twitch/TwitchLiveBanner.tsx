'use client';

/**
 * <TwitchLiveBanner /> (v2.31, ADR-005 Sektion E)
 *
 * Ruhige Live-Leiste über der TopNavBar (seit 28.10.2026): LIVE-Marke,
 * Kanal, Titel, Zuschauer und Knopf. Klick führt zu /artists#live. Die
 * früheren Effekte (Farbwechsel, Zittern, Laufschrift, Blink-LEDs) sind
 * raus, Begründung in globals.css beim Block „Livestream".
 *
 * Wenn der Channel offline ist oder kein Channel konfiguriert ist, rendert
 * der Banner nichts — bleibt komplett unsichtbar.
 *
 * Polling 30s. Server-API hat selbst 30s-Cache vor Helix, also 1 Helix-Call
 * pro Server pro Minute pro Browser.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

type LiveResponse = {
  configured: boolean;
  channel: string | null;
  live: boolean;
  title?: string;
  viewerCount?: number;
  gameName?: string | null;
};

const POLL_MS = 30_000;

export function TwitchLiveBanner() {
  const t = useTranslations('widgetsUi');
  const [data, setData] = useState<LiveResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/twitch/live-status');
        if (!res.ok) return;
        const json: LiveResponse = await res.json();
        if (!cancelled) setData(json);
      } catch {
        /* silent — Banner verschwindet einfach bei Netzwerkfehler */
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data?.configured || !data.live || !data.channel) return null;

  return (
    <Link
      // Führt dorthin, wo der Stream wirklich läuft: die Karte auf /artists.
      href="/artists#live"
      aria-label={t('watchLiveStreamAria', { channel: data.channel })}
      className="kbk-live-leiste"
    >
      <div className="kbk-live-leiste-innen">
        <span className="kbk-live-marke">
          <i className="kbk-live-punkt" aria-hidden />
          {t('liveBadge')}
        </span>
        <span className="kbk-live-kanal">
          Twitch <span>/</span> {data.channel}
        </span>
        <span className="kbk-live-leiste-titel">{data.title ?? ''}</span>
        {typeof data.viewerCount === 'number' && (
          <span className="kbk-live-zahl">{t('watching', { count: data.viewerCount })}</span>
        )}
        <span className="kbk-live-knopf">{t('watchNow')}</span>
      </div>
    </Link>
  );
}
