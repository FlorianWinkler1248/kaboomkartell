/**
 * MCP-Discovery — Single Source of Truth für alle Discovery-Oberflächen.
 *
 * Client-safe: KEINE Server-Imports (prisma/fs/nodemailer) — wird von
 * Client-Komponenten (AiAgentsSection, /mcp-Seite) und dem Root-Layout
 * gleichermaßen importiert (Boundary-Regel, prozesse/pflicht/client-server-boundary.md).
 *
 * Statische Spiegel dieser Werte (bei Änderung mitziehen — Wirkungs-Kette im
 * Workflow kbk-mcp-discovery): public/.well-known/mcp.json, public/llms.txt,
 * public/robots.txt, next.config.ts (Link-Header).
 *
 * Versprochen wird nur, was der Server real kann: read-only + play_channel +
 * token-gated vote_track (Agenten-Auth-Bridge, ADR-035) + get_multiverse
 * (Kanon-Möglichkeitsraum, ADR-036/037).
 */

export const MCP_SERVER_URL = 'https://mcp.kaboomkartell.com/mcp';
export const MCP_HEALTH_URL = 'https://mcp.kaboomkartell.com/health';
export const MCP_SERVER_NAME = 'KaboomKartell Radio';
export const MCP_TRANSPORT = 'streamable-http';
export const MCP_RATE_LIMIT = '60 requests/min per IP';
export const MCP_DOCS_PATH = '/mcp';

/** Tool-Inventar des Live-Servers (15 Tools), gruppiert für die UI. */
export const MCP_TOOL_GROUPS: ReadonlyArray<{
  title: string;
  tools: ReadonlyArray<{ name: string; desc: string }>;
}> = [
  {
    title: 'Radio',
    tools: [
      { name: 'get_now_playing', desc: 'What is spinning right now, per channel' },
      { name: 'list_channels', desc: 'Real channel + genre structure' },
      { name: 'get_schedule', desc: 'Upcoming slots and shows' },
      { name: 'get_next_drop', desc: 'The single next drop with countdown' },
      { name: 'get_crowd_control', desc: 'The 5 tracks the crowd votes between' },
      { name: 'vote_track', desc: 'Vote on the next drop in your human\'s name (token from /settings/agent-access)' },
    ],
  },
  {
    title: 'Music Library',
    tools: [
      { name: 'search_tracks', desc: 'Find tracks by title, artist or genre' },
      { name: 'get_track', desc: 'Full track details incl. AI disclosure' },
      { name: 'list_playlists', desc: 'Curated playlists' },
      { name: 'get_playlist', desc: 'Tracks of one playlist' },
    ],
  },
  {
    title: 'The Multiverse',
    tools: [
      { name: 'get_multiverse', desc: 'The canon of the KBK song multiverse as a possibility space — cosmology, rules and sealed zones to derive your own canon-true stories from' },
    ],
  },
  {
    title: 'Community',
    tools: [
      { name: 'get_stats', desc: 'Wolves online, tracks spun, avg BPM, aura' },
      { name: 'get_twitch_status', desc: 'Twitch live state' },
      { name: 'get_live_alert', desc: 'Live now or imminent? The one justified moment to ping your human' },
    ],
  },
  {
    title: 'Player Widget',
    tools: [
      { name: 'play_channel', desc: 'Opens the interactive live-radio player right in the chat' },
    ],
  },
];

export const MCP_TOOL_COUNT = MCP_TOOL_GROUPS.reduce(
  (n, g) => n + g.tools.length,
  0,
);
