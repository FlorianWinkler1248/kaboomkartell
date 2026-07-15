'use client';

/**
 * SoundCloudEmbed - Iframe-basierter SoundCloud Player
 *
 * Wird angezeigt wenn ein SoundCloud-Track aktiv ist.
 * Ersetzt ProgressBar + PlayerControls für SoundCloud-Tracks.
 */

import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';

interface SoundCloudEmbedProps {
  embedUrl: string;
  trackTitle: string;
  soundcloudUrl?: string;
}

export default function SoundCloudEmbed({
  embedUrl,
  trackTitle,
  soundcloudUrl,
}: SoundCloudEmbedProps) {
  const t = useTranslations('playerUi');
  const iframeSrc = buildEmbedUrl(embedUrl, {
    color: '%2300b300',
    auto_play: 'false',
    hide_related: 'true',
    show_comments: 'false',
    show_user: 'true',
    show_reposts: 'false',
    show_teaser: 'false',
    visual: 'false',
  });

  return (
    <div className="rounded-lg overflow-hidden bg-[var(--color-kbk-dark-800)] border border-[var(--color-border)]">
      <iframe
        width="100%"
        height={166}
        scrolling="no"
        frameBorder="no"
        allow="autoplay"
        src={iframeSrc}
        title={t('soundcloudTitle', { trackTitle })}
      />
      {soundcloudUrl && (
        <div className="px-3 py-2 flex items-center justify-between text-xs text-[var(--color-muted)] border-t border-[var(--color-border)]/50">
          <span>{t('playbackViaSoundCloud')}</span>
          <a
            href={soundcloudUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[var(--color-rasta-green)] hover:brightness-125 transition-all"
          >
            {t('openOnSoundCloud')} <ExternalLink size={12} />
          </a>
        </div>
      )}
    </div>
  );
}

function buildEmbedUrl(baseUrl: string, params: Record<string, string>): string {
  try {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    return url.toString();
  } catch {
    return baseUrl;
  }
}
