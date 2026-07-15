'use client';

/**
 * BoomySection — Mascot-Section auf der Apex-Page.
 *
 * Boomy als großer animierter Pixel-Wolf (BoomyMascot, 4-Frame-Sprite-Loop
 * @ 140 BPM) in einer Vulkanglas-Card mit Boomy-Lila-Frame. Daneben kurze
 * Persona-Vorstellung + Link auf das Boomy-Profil.
 *
 * Hausparty-Logik: 4Flow ist Host (Hero-Section), Boomy ist sein
 * extrovertierter Stellvertreter — direkt darunter sichtbar, „immer wach,
 * immer am Beat".
 *
 * v2.25 (03.05.2026 nacht).
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import BoomyMascot from '../BoomyMascot';
import { obsidianFrameVars } from '@/lib/obsidian-frame';

const BOOMY_PURPLE = '#8B5CF6';

export default function BoomySection() {
  const t = useTranslations('boomy');
  return (
    <section style={{ padding: '32px 24px' }}>
      <div
        className="kbk-obsidian framed"
        style={{
          ...obsidianFrameVars(BOOMY_PURPLE),
          maxWidth: 1080,
          margin: '0 auto',
          padding: 24,
          borderRadius: 14,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: 24,
          alignItems: 'center',
        }}
      >
        {/* Mascot links — gross sichtbar (Boomys Crowd tanzt unterhalb der
            Sektion, siehe DanceCrowd in page.tsx) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <BoomyMascot size={144} />
        </div>

        {/* Text rechts */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.22em',
              color: 'rgba(180, 140, 255, 0.85)',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {t('eyebrow')}
          </div>
          <h2
            className="font-heading"
            style={{
              fontSize: 'clamp(24px, 3.4vw, 36px)',
              fontWeight: 900,
              letterSpacing: '0.02em',
              margin: 0,
              color: '#fff',
              textShadow: '0 0 24px rgba(139,92,246,0.45)',
            }}
          >
            {t('headline')}
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.55,
              margin: '10px 0 0 0',
              maxWidth: 420,
            }}
          >
            {t('tagline')}
          </p>
          <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link
              href="/profile/boomy"
              className="kbk-obsidian polished"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '9px 16px',
                borderRadius: 8,
                fontFamily: 'var(--font-display)',
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#B69DFF',
                textDecoration: 'none',
                boxShadow: 'inset 0 0 0 1px rgba(139,92,246,0.6), 0 0 14px rgba(139,92,246,0.2)',
              }}
            >
              {t('meetBoomy')}
            </Link>
            <Link
              href="/library?artist=boomy"
              className="kbk-obsidian polished"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '9px 16px',
                borderRadius: 8,
                fontFamily: 'var(--font-display)',
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.85)',
                textDecoration: 'none',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
              }}
            >
              {t('hisTracks')}
            </Link>
            {/* MCP-Einstieg bewusst nur als neutraler Button — technische Details
                (Endpoint, Snippets) leben auf /mcp, nie als erster Eindruck
                (Flow-Regel 12.06.2026; Workflow kbk-mcp-discovery, ADR-029). */}
            <Link
              href="/mcp"
              className="kbk-obsidian polished"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '9px 16px',
                borderRadius: 8,
                fontFamily: 'var(--font-display)',
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.85)',
                textDecoration: 'none',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
              }}
            >
              {t('connectAgent')}
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile-Override: Stack vertikal unter 640px */}
      <style>{`
        @media (max-width: 640px) {
          section > div {
            grid-template-columns: 1fr !important;
            text-align: center;
          }
          section > div > div:first-child {
            justify-content: center;
          }
          section > div p {
            margin-left: auto;
            margin-right: auto;
          }
          section > div > div:last-child > div:last-child {
            justify-content: center;
          }
        }
      `}</style>
    </section>
  );
}
