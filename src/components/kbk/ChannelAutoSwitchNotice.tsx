'use client';

/**
 * ChannelAutoSwitchNotice — Hinweis über der Player-Leiste, wenn das Set im
 * gewählten Channel endet und der andere Channel sendet.
 *
 * Zeigt den Countdown bis zum Wechsel (spätestens das Ende des eigenen letzten Titels)
 * mit „Abbrechen" und „Jetzt wechseln". Die Entscheidung selbst trifft der
 * PlayerProvider (lib/channel-autoswitch.ts); hier wird nur angezeigt.
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePlayer } from '@/components/providers/PlayerProvider';
import { formatCountdown } from '@/lib/channel-autoswitch';
import { CHANNEL_COLORS } from '@/hooks/useChannelAccent';

export default function ChannelAutoSwitchNotice() {
  const t = useTranslations('player.autoSwitch');
  const pathname = usePathname();
  const { autoSwitch, cancelAutoSwitch, confirmAutoSwitch, selectedChannel, getServerNow } = usePlayer();
  const [remainingMs, setRemainingMs] = useState(0);

  const switchAtMs = autoSwitch?.switchAtMs ?? null;
  useEffect(() => {
    if (switchAtMs === null) return;
    const tick = () => setRemainingMs(switchAtMs - getServerNow());
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [switchAtMs, getServerNow]);

  // Wie der MiniPlayer: im Admin- und Studio-Bereich nicht sichtbar.
  const hide = (pathname?.startsWith('/admin') || pathname?.startsWith('/studio')) ?? false;
  if (!autoSwitch || hide) return null;

  const accent =
    (CHANNEL_COLORS as Record<string, string>)[autoSwitch.target] ?? 'var(--rasta-yellow)';

  return (
    <div
      role="status"
      aria-live="polite"
      className="kbk-obsidian"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(108px + env(safe-area-inset-bottom, 0px))',
        zIndex: 90,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 10,
        width: 'max-content',
        maxWidth: 'calc(100vw - 24px)',
        boxShadow: `inset 0 0 0 1px ${accent}80, 0 8px 28px rgba(0,0,0,0.6)`,
        fontFamily: 'var(--font-body)',
        fontSize: 13.5,
        color: 'var(--text-primary)',
      }}
    >
      <span>
        {t('message', {
          from: selectedChannel.toUpperCase(),
          to: autoSwitch.target.toUpperCase(),
        })}{' '}
        <strong
          style={{ fontFamily: 'var(--font-mono)', color: accent, fontVariantNumeric: 'tabular-nums' }}
        >
          {formatCountdown(remainingMs)}
        </strong>
      </span>
      <span style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={cancelAutoSwitch}
          className="cursor-pointer"
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.25)',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontWeight: 600,
          }}
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={confirmAutoSwitch}
          className="cursor-pointer"
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: `1px solid ${accent}`,
            background: accent,
            color: 'var(--kbk-black)',
            fontWeight: 700,
          }}
        >
          {t('switchNow')}
        </button>
      </span>
    </div>
  );
}
