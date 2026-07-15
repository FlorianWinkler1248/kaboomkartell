'use client';

/**
 * SynthLayout — Haupt-Layout für den Synthesizer Learn-Bereich.
 *
 * v2.23 (02.05.2026 nacht): Obsidian-Vulkanglas-Migration. Hero-Header und
 * Footer-Hint laufen jetzt als `kbk-obsidian framed`-Cards mit pulsierendem
 * Neon-Border (rasta-green default), passend zum restlichen Public-UI.
 */

import { useTranslations } from 'next-intl';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import DanceSprite from '@/components/kbk/DanceSprite';

interface SynthLayoutProps {
  children: React.ReactNode;
}

const RASTA_GREEN = '#3FCF4A';

export default function SynthLayout({ children }: SynthLayoutProps) {
  const t = useTranslations('widgetsUi');
  return (
    <div className="min-h-screen bg-kbk-black">
      {/* Hero-Header — Vulkanglas-Card mit gruenem Frame.
          Der äußere (nicht-framed) Wrapper trägt das animate-fade-in-up, damit
          der ganze Hero beim Laden sanft hochgleitet — der framed-Frame-Puls
          würde die Klassen-Animation sonst überschreiben. */}
      <div className="px-4 pt-10 pb-8 animate-fade-in-up">
        <div
          className="kbk-obsidian framed mx-auto max-w-3xl text-center"
          style={{
            ...obsidianFrameVars(RASTA_GREEN),
            padding: '36px 24px',
            borderRadius: 14,
          }}
        >
          {/* Label — mit pulsierendem Live-Dot als Interaktions-Signal */}
          <div
            className="inline-flex items-center gap-2 mb-4"
            style={{
              padding: '5px 14px',
              borderRadius: 999,
              border: '1px solid rgba(63,207,74,0.35)',
              background: 'rgba(63,207,74,0.10)',
            }}
          >
            <span
              aria-hidden="true"
              className="animate-live-pulse"
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#3FCF4A',
              }}
            />
            <span
              style={{
                color: '#3FCF4A',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              {t('interactiveTutorial')}
            </span>
          </div>

          <h1
            className="font-heading"
            style={{
              fontWeight: 900,
              fontSize: 'clamp(28px, 5vw, 44px)',
              letterSpacing: '0.02em',
              marginBottom: 12,
              color: '#fff',
            }}
          >
            KBK{' '}
            {/* „Synth Lab" atmet dezent weiter — inline-block, damit der
                Scale-Puls (animate-breathe) greift. */}
            <span
              className="text-rasta-gradient animate-breathe"
              style={{ display: 'inline-block' }}
            >
              Synth Lab
            </span>
          </h1>

          <p
            style={{
              color: 'rgba(255,255,255,0.72)',
              fontSize: 16,
              maxWidth: 520,
              margin: '0 auto',
              lineHeight: 1.5,
            }}
          >
            {t('synthTagline')}
            <br />
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
              {t('synthSubtagline')}
            </span>
          </p>
        </div>
      </div>

      {/* Tutorial-Inhalt */}
      <div className="max-w-5xl mx-auto px-4 pb-16 space-y-8">
        {children}
      </div>

      {/* Boomys Crew vibet am Ende des Kurses mit — echte Leerstelle zwischen
          letztem Schritt und Footer. Andere Figuren als oben (shroom/slime),
          rahmenlos, aria-hidden, mittig → kein horizontaler Overflow. */}
      <div className="px-4 pb-2 flex items-end justify-center gap-6">
        <DanceSprite name="boombox" size={44} bobDelayMs={-600} />
        <DanceSprite name="tvhead" size={50} bobDelayMs={-1300} />
      </div>

      {/* Footer-Hinweis */}
      <div className="px-4 pb-8">
        <div
          className="kbk-obsidian mx-auto max-w-md text-center"
          style={{
            padding: '14px 18px',
            borderRadius: 10,
          }}
        >
          <p
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.04em',
              margin: 0,
            }}
          >
            {t('synthFooterHint')}
          </p>
        </div>
      </div>
    </div>
  );
}
