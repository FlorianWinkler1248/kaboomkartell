import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import CopyPill from '@/components/kbk/CopyPill';
import DanceSprite from '@/components/kbk/DanceSprite';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import {
  MCP_SERVER_URL,
  MCP_HEALTH_URL,
  MCP_RATE_LIMIT,
  MCP_TOOL_COUNT,
  MCP_TOOL_GROUPS,
} from '@/lib/mcp-info';

/**
 * /mcp — „For AI Agents": die menschenlesbare Discovery-Seite.
 *
 * Endpoint + Connect-Snippets (Claude / Claude Code / ChatGPT / Mistral /
 * generisch) + Tool-Übersicht + Transparenz-Box. Statisch, kein DB-Zugriff —
 * funktioniert auch, wenn der MCP-Server selbst down ist.
 *
 * i18n: erklärende Texte über next-intl (Namespace `mcpPage`, Metadata `meta.mcp`).
 * Technische Begriffe, Tool-Namen, URLs, JSON-Snippets + Connection-Config
 * bleiben unverändert (EN/technisch).
 *
 * Workflow: kbk-mcp-discovery · SoT: src/lib/mcp-info.ts · ADR-027/029.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.mcp');
  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      type: 'website',
    },
  };
}

const AI_PURPLE = '#8B5CF6';

const GENERIC_CONFIG = `{
  "mcpServers": {
    "kaboomkartell": {
      "type": "http",
      "url": "${MCP_SERVER_URL}"
    }
  }
}`;

/**
 * Connect-Wege — bewusst generisch formuliert (fremde UIs ändern sich).
 * `titleKey`/`bodyKey` zeigen in den Namespace `mcpPage.connect`. Produkt-/
 * Markennamen + Snippets bleiben technisch (nicht übersetzt).
 */
const CONNECT_STEPS: ReadonlyArray<{ titleKey: string; bodyKey: string; snippet?: string }> = [
  {
    titleKey: 'claudeTitle',
    bodyKey: 'claudeBody',
  },
  {
    titleKey: 'claudeCodeTitle',
    bodyKey: 'claudeCodeBody',
    snippet: `claude mcp add --transport http kaboomkartell ${MCP_SERVER_URL}`,
  },
  {
    titleKey: 'chatgptTitle',
    bodyKey: 'chatgptBody',
  },
  {
    titleKey: 'mistralTitle',
    bodyKey: 'mistralBody',
  },
  {
    titleKey: 'genericTitle',
    bodyKey: 'genericBody',
    snippet: GENERIC_CONFIG,
  },
];

export default async function McpPage() {
  const t = await getTranslations('mcpPage');

  // Badges: erklärende Labels übersetzt, technische Werte (Tool-Count,
  // Rate-Limit, Health-Pfad) bleiben unverändert.
  const badges: ReadonlyArray<string> = [
    t('badgeReadOnly'),
    t('badgeNoAuth'),
    t('badgeToolCount', { count: MCP_TOOL_COUNT }),
    MCP_RATE_LIMIT,
    'Health: /health',
  ];

  return (
    <div style={{ padding: '40px 24px 64px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.22em',
            color: 'rgba(180, 140, 255, 0.85)',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          ↳ {t('kicker')}
        </div>
        <h1
          className="font-heading"
          style={{
            fontSize: 'clamp(30px, 5vw, 52px)',
            fontWeight: 900,
            letterSpacing: '0.02em',
            margin: 0,
            color: '#fff',
            textShadow: '0 0 28px rgba(139,92,246,0.5)',
          }}
        >
          {t('heading')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            color: 'rgba(255,255,255,0.72)',
            lineHeight: 1.6,
            margin: '14px 0 0 0',
            maxWidth: 640,
          }}
        >
          {t('intro')}
        </p>

        {/* Endpoint-Card */}
        <div
          className="kbk-obsidian framed"
          style={{
            ...obsidianFrameVars(AI_PURPLE),
            marginTop: 28,
            padding: 24,
            borderRadius: 14,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.22em',
              color: 'rgba(180, 140, 255, 0.85)',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {t('endpointLabel')}
          </div>
          <div style={{ maxWidth: 520 }}>
            <CopyPill value={MCP_SERVER_URL} />
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 14,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            {badges.map((badge) => (
              <span
                key={badge}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(139,92,246,0.35)',
                  color: 'rgba(255,255,255,0.65)',
                }}
              >
                {badge}
              </span>
            ))}
          </div>
        </div>

        {/* Tools */}
        <h2 className="kbk-mcp-h2 font-heading">{t('toolsHeading')}</h2>
        <div className="kbk-mcp-grid">
          {MCP_TOOL_GROUPS.map((group) => (
            <div
              key={group.title}
              className="kbk-obsidian"
              style={{ padding: 18, borderRadius: 12 }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 13,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#B69DFF',
                  marginBottom: 10,
                }}
              >
                {group.title}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {group.tools.map((tool) => (
                  <li key={tool.name} style={{ marginBottom: 8 }}>
                    <code
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.9)',
                      }}
                    >
                      {tool.name}
                    </code>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: 'rgba(255,255,255,0.55)',
                        lineHeight: 1.45,
                      }}
                    >
                      {tool.desc}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Connect */}
        <h2 className="kbk-mcp-h2 font-heading">{t('connectHeading')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {CONNECT_STEPS.map((step) => (
            <div
              key={step.titleKey}
              className="kbk-obsidian"
              style={{ padding: 18, borderRadius: 12 }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 13,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#fff',
                  marginBottom: 6,
                }}
              >
                {t(`connect.${step.titleKey}`)}
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
                  color: 'rgba(255,255,255,0.65)',
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                {t(`connect.${step.bodyKey}`)}
              </p>
              {step.snippet && (
                <div style={{ marginTop: 10, maxWidth: 640 }}>
                  <CopyPill value={step.snippet} multiline={step.snippet.includes('\n')} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Transparenz / House Rules */}
        <div
          className="kbk-obsidian framed"
          style={{
            ...obsidianFrameVars('#3FCF4A'),
            marginTop: 32,
            padding: 24,
            borderRadius: 14,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.22em',
              color: 'rgba(63,207,74,0.85)',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {t('houseRulesLabel')}
          </div>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: 12.5,
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.7,
            }}
          >
            <li>→ {t('rule1')}</li>
            <li>→ {t('rule2')}</li>
            <li>→ {t('rule3')}</li>
            <li>→ {t('rule4', { rate: MCP_RATE_LIMIT })}</li>
            <li>→ {t('rule5')}</li>
          </ul>
        </div>

        {/* Machine-Discovery Footer */}
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            color: 'rgba(255,255,255,0.45)',
            lineHeight: 1.6,
            marginTop: 28,
          }}
        >
          {t.rich('discovery', {
            headerCode: () => <code>Link: rel=&quot;mcp-server&quot;</code>,
            htmlCode: () => <code>&lt;link rel=&quot;mcp-server&quot;&gt;</code>,
            wellKnown: () => (
              <a href="/.well-known/mcp.json" style={{ color: '#B69DFF' }}>
                /.well-known/mcp.json
              </a>
            ),
            llms: () => (
              <a href="/llms.txt" style={{ color: '#B69DFF' }}>
                /llms.txt
              </a>
            ),
            health: () => (
              <a href={MCP_HEALTH_URL} style={{ color: '#B69DFF' }}>
                {MCP_HEALTH_URL}
              </a>
            ),
            party: (chunks) => (
              <Link href="/" style={{ color: '#B69DFF' }}>
                {chunks}
              </Link>
            ),
          })}
        </p>

        {/* robo-chrome + robo-bass tanzen im Fuß der Agenten-Seite — ein
            dezenter Bot-Gruß in der Leerstelle unter dem Discovery-Text, rein
            dekorativ, ohne Rahmen/Linien (Design-Regel Dance-Sprites). */}
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: 20 }}
          aria-hidden="true"
        >
          <DanceSprite name="robo-chrome" size={48} bobDelayMs={-400} />
          <DanceSprite name="robo-bass" size={50} bobDelayMs={-1000} />
        </div>
      </div>

      {/* Responsive: Tool-Grid 4 → 2 → 1 Spalten (Tablet-Stufe nicht vergessen!) */}
      <style>{`
        .kbk-mcp-h2 {
          font-size: clamp(20px, 2.6vw, 28px);
          font-weight: 900;
          letter-spacing: 0.04em;
          color: #fff;
          margin: 40px 0 16px 0;
        }
        .kbk-mcp-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        @media (max-width: 1023px) {
          .kbk-mcp-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .kbk-mcp-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
