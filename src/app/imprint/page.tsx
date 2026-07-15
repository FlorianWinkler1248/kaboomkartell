import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SectionTitle } from '@/components/kbk/SectionTitle';

/**
 * Impressum-Seite (Cockpit-Style).
 *
 * Status: Privat-Hobby-Plattform, nicht-kommerziell.
 * Anschrift bewusst weggelassen (4Flow-Entscheidung).
 * Mono-Font für Lesbarkeit der Paragraphen.
 *
 * i18n: Labels/Ueberschriften/Rechtstexte sind uebersetzbar (Namespace
 * `imprint`). Name + E-Mail bleiben als feste Daten stehen — sie sind
 * keine UI-Strings, sondern rechtliche Pflichtangaben.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.imprint');
  return {
    title: t('title'),
    description: t('description'),
  };
}

// Wiederverwendete Card-Styles für die Impressum-Sektionen.
// kbk-obsidian framed wird per className auf jedes Card-Element gelegt.
const cardStyle: React.CSSProperties = {
  padding: 24,
  marginBottom: 14,
};

const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 16,
  fontWeight: 900,
  color: '#fff',
  letterSpacing: '0.1em',
  margin: '0 0 12px',
  textTransform: 'uppercase',
};

const bodyText: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  color: 'rgba(255,255,255,0.78)',
  lineHeight: 1.7,
  margin: 0,
};

export default async function ImprintPage() {
  const t = await getTranslations('imprint');

  return (
    <section
      style={{
        padding: '40px 24px',
        maxWidth: 760,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <SectionTitle sub="I" label={t('kicker')} title={t('title')} accent="green" />

      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: '0.15em',
          marginTop: 14,
          marginBottom: 28,
        }}
      >
        {t('legalBasis')}
      </p>

      {/* Betreiber */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('operatorHeading')}</h2>
        <p style={bodyText}>
          {t('operatorBody', { name: 'Florian Winkler' })}
        </p>
      </section>

      {/* Kontakt */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('contactHeading')}</h2>
        <div style={bodyText}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                color: '#3FCF4A',
                letterSpacing: '0.15em',
                minWidth: 80,
              }}
            >
              {t('emailLabel')}
            </span>
            <a
              href="mailto:4flow@kaboomkartell.com"
              style={{
                color: '#3FCF4A',
                textDecoration: 'none',
                wordBreak: 'break-all',
              }}
            >
              4flow@kaboomkartell.com
            </a>
          </div>
          <p style={{ ...bodyText, marginTop: 16, fontSize: 12, opacity: 0.7 }}>
            {t('contactNote')}
          </p>
        </div>
      </section>

      {/* Verantwortlich */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('responsibleHeading')}</h2>
        <p style={bodyText}>
          Florian Winkler<br />
          {t('responsibleContactRef')}
        </p>
      </section>

      {/* KI-Transparenz */}
      <section
        style={{
          ...cardStyle,
          border: '1px solid rgba(159,107,255,0.4)',
        }}
      >
        <h2 style={{ ...sectionHeading, color: '#9F6BFF' }}>{t('aiHeading')}</h2>
        <p style={{ ...bodyText, marginBottom: 12 }}>
          {t.rich('aiBody', {
            tag: (chunks) => (
              <span style={{ color: '#9F6BFF', fontWeight: 700 }}>{chunks}</span>
            ),
          })}
        </p>
        <p style={bodyText}>
          {t.rich('aiBoomy', {
            boomy: (chunks) => (
              <Link
                href="/profile/boomy"
                style={{ color: '#9F6BFF', textDecoration: 'none' }}
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>

      {/* Haftung Inhalte */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('liabilityContentHeading')}</h2>
        <p style={{ ...bodyText, marginBottom: 12 }}>
          {t('liabilityContentBody1')}
        </p>
        <p style={bodyText}>
          {t('liabilityContentBody2')}
        </p>
      </section>

      {/* Haftung Links */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('liabilityLinksHeading')}</h2>
        <p style={bodyText}>
          {t('liabilityLinksBody')}
        </p>
      </section>

      {/* Urheberrecht */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('copyrightHeading')}</h2>
        <p style={bodyText}>
          {t('copyrightBody')}
        </p>
      </section>

      {/* EU-Streitbeilegung */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('disputeHeading')}</h2>
        <p style={bodyText}>
          {t.rich('disputeBody', {
            odr: (chunks) => (
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#3FCF4A', textDecoration: 'none' }}
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </section>
    </section>
  );
}
