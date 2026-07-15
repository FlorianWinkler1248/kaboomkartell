/**
 * Helper für dynamische Frame-Color der .kbk-obsidian.framed-Klasse.
 *
 * Obsidian-Cards bekommen ihren Neon-Border-Glow über CSS-Variablen
 * (--neon-r, --neon-g, --neon-b). Per Default ist es Rasta-Green; pro
 * Card-Color kann man das via inline-style umschalten.
 *
 * Beispiel:
 *   <div className="kbk-obsidian framed" style={{...obsidianFrameVars('#E63B2E'), padding: 16}}>
 */

import type { CSSProperties } from 'react';

export function obsidianFrameVars(hexColor: string): CSSProperties {
  const match = hexColor.match(/#?([0-9a-f]{6})/i);
  if (!match) return {};
  const num = parseInt(match[1], 16);
  return {
    ['--neon-r' as string]: String((num >> 16) & 0xff),
    ['--neon-g' as string]: String((num >> 8) & 0xff),
    ['--neon-b' as string]: String(num & 0xff),
  } as CSSProperties;
}
