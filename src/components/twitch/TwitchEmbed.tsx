'use client';

/**
 * <TwitchEmbed channel="kbk4flow" /> (v2.30, ADR-005 Sektion E)
 *
 * Iframe-Embed des Twitch-Player. Twitch verlangt seit 2021, dass die
 * Eltern-Domain explizit als `parent`-Query-Parameter mitkommt — sonst
 * blockiert das Embed mit „This content isn't allowed to be embedded".
 *
 * Default-Parent kaboomkartell.com + www-Subdomain + localhost (dev).
 * Wenn `parent` als Prop kommt, wird er zusätzlich angehängt.
 */

import { useEffect, useState } from 'react';

interface TwitchEmbedProps {
  channel: string;
  parent?: string;
  width?: string | number;
  height?: string | number;
  muted?: boolean;
  autoplay?: boolean;
}

export function TwitchEmbed({
  channel,
  parent,
  width = '100%',
  height = '100%',
  muted = false,
  autoplay = true,
}: TwitchEmbedProps) {
  // parent-Liste wird client-side ermittelt, damit der Embed auch im
  // Preview/Staging unter wechselnden Domains läuft.
  const [parents, setParents] = useState<string[]>(['kaboomkartell.com', 'www.kaboomkartell.com']);

  useEffect(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const next = new Set(['kaboomkartell.com', 'www.kaboomkartell.com']);
    if (host) next.add(host);
    if (parent) next.add(parent);
    setParents(Array.from(next));
  }, [parent]);

  const params = new URLSearchParams();
  params.set('channel', channel);
  params.set('autoplay', autoplay ? 'true' : 'false');
  params.set('muted', muted ? 'true' : 'false');
  parents.forEach((p) => params.append('parent', p));

  const src = `https://player.twitch.tv/?${params.toString()}`;

  return (
    <iframe
      src={src}
      allowFullScreen
      title={`Twitch · ${channel}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        border: 'none',
        display: 'block',
      }}
    />
  );
}
