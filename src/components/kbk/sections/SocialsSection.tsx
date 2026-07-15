'use client';

/**
 * SocialsSection — "THE WOLFPACK LIVES EVERYWHERE"
 *
 * Client Component — die Karten sind statische Links ohne DB-Anbindung, das
 * Hover-Verhalten kommt aus dem Obsidian-Frame (`.kbk-obsidian.framed`).
 *
 * Die Link-Daten kommen aus der zentralen Quelle `@/lib/site-links`
 * (SOCIAL_LINKS), geteilt mit dem Footer. Icons bleiben hier (ReactNodes gehören
 * nicht in die Daten-Datei) — das Mapping läuft über die `id`.
 */

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import {
  IcoDiscordLogo,
  IcoTikTokLogo,
  IcoInstagramLogo,
  IcoWave,
} from '@/components/kbk/icons';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { SOCIAL_LINKS, type SocialId } from '@/lib/site-links';

// Icon pro Plattform — Mapping über die id aus SOCIAL_LINKS.
const ICONS: Record<SocialId, ReactNode> = {
  soundcloud: <IcoWave size={32} />,
  instagram: <IcoInstagramLogo size={32} />,
  tiktok: <IcoTikTokLogo size={32} />,
  discord: <IcoDiscordLogo size={32} />,
};

export default function SocialsSection() {
  const t = useTranslations('home.socials');
  return (
    <div className="kbk-page-section" style={{ padding: '20px 24px' }}>
      <SectionTitle sub="04" label={t('sectionLabel')} title={t('sectionTitle')} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginTop: 20,
        }}
      >
        {SOCIAL_LINKS.map((s) => (
          <a
            key={s.id}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="kbk-obsidian framed"
            style={{
              ...obsidianFrameVars(s.color),
              padding: '20px 16px',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 140,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div
              style={{
                color: s.color,
                display: 'flex',
                justifyContent: 'flex-start',
                alignItems: 'center',
              }}
            >
              {ICONS[s.id]}
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  fontWeight: 900,
                  color: '#fff',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.5)',
                  marginTop: 2,
                }}
              >
                {s.handle}
              </div>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: s.color,
                letterSpacing: '0.2em',
                marginTop: 'auto',
                textTransform: 'uppercase',
              }}
            >
              {t('follow')}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
