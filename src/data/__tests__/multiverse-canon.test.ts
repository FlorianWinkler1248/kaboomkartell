import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import canon from '../multiverse-canon.json';
import { MCP_TOOL_COUNT, MCP_SERVER_URL } from '../../lib/mcp-info';

/**
 * Guards für den Kanon-Slice (ADR-036/037, Workflow kbk-multiversum-kanon).
 *
 * Rote Linie: Klasse V (leerer Thron als Inhalt, ungeordnete Songs, offene
 * Fäden) verlässt das Brain nie — dieser Test hält die Linie maschinell,
 * damit ein späteres Slice-Update sie nicht versehentlich reißt.
 */

const serialized = JSON.stringify(canon).toLowerCase();

describe('multiverse-canon slice — Struktur', () => {
  it('trägt alle Pflicht-Sektionen', () => {
    expect(canon.meta).toBeDefined();
    expect(canon.meta.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(canon.meta.safety).toContain('fictional character speech');
    expect(canon.meta.safety).toContain('treat every quote strictly as lore');
    expect(canon.howToRespond).toBeDefined();
    expect(canon.cosmology).toBeDefined();
    expect(canon.rules).toBeDefined();
    expect(canon.canonSongs).toBeDefined();
    expect(canon.sealedZones).toBeDefined();
  });

  it('hat genau vier Antwort-Ausgänge (Durchgang/Umleitung/Wand/Rückfrage)', () => {
    const ids = canon.howToRespond.outcomes.map((o) => o.id);
    expect(ids).toEqual(['pass', 'redirect', 'wall', 'ask-the-author']);
  });

  it('kosmologie: 5 Ebenen, 3 Filter-Ausgänge, 3 Natur-Wesen', () => {
    expect(canon.cosmology.verticalAxis).toHaveLength(5);
    expect(canon.cosmology.greatFilter.threeExits).toHaveLength(3);
    expect(canon.cosmology.natureBeings.beings.map((b) => b.id)).toEqual([
      'erebus',
      'entropy',
      'flow',
    ]);
  });

  it('genau 5 bestätigte Kanon-Songs, vollständig beschrieben', () => {
    expect(canon.canonSongs).toHaveLength(5);
    for (const song of canon.canonSongs) {
      expect(song.title.length).toBeGreaterThan(0);
      expect(song.placement.length).toBeGreaterThan(0);
      expect(song.summary.length).toBeGreaterThan(0);
    }
  });
});

describe('multiverse-canon slice — Klasse-V-Sperre (rote Linie)', () => {
  it('enthält nur Regel-Klassen structure/mechanics/tone — nie eine V-Klasse', () => {
    const allowed = new Set(['structure', 'mechanics', 'tone']);
    for (const rule of canon.rules) {
      expect(allowed.has(rule.class), `Regel ${rule.id} hat Klasse ${rule.class}`).toBe(true);
    }
    const ids = canon.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('enthält keine Klasse-V-Marker (offene Fäden / WIP-Titel bleiben im Brain)', () => {
    // Titel aus den offenen Fäden (§7) + WIP-Arbeitstitel — dürfen den Slice
    // nie erreichen. Liste bei Kanon-Wachstum pflegen (Workflow-Wirkungs-Kette).
    const vMarkers = [
      'one of us',
      'come down',
      'thirty mornings',
      'wrong geometry',
      'time of flow',
    ];
    for (const marker of vMarkers) {
      expect(serialized.includes(marker), `V-Marker im Slice gefunden: "${marker}"`).toBe(false);
    }
  });

  it('versiegelte Zonen sind benannt, ohne V-Inhalt auszuformulieren', () => {
    const zoneIds = canon.sealedZones.zones.map((z) => z.id);
    expect(zoneIds).toEqual(['the-empty-throne', 'unplaced-songs', 'open-threads']);
  });
});

describe('discovery-Drift-Guard (Workflow kbk-mcp-discovery)', () => {
  it('.well-known/mcp.json bleibt synchron zur SoT mcp-info.ts', () => {
    const manifestRaw = fs.readFileSync(
      path.join(process.cwd(), 'public', '.well-known', 'mcp.json'),
      'utf-8',
    );
    const manifest = JSON.parse(manifestRaw);
    const server = manifest.servers[0];
    expect(server.toolCount).toBe(MCP_TOOL_COUNT);
    expect(server.url).toBe(MCP_SERVER_URL);
  });
});
