import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import { CONTACT_EMAIL } from '@/lib/site-links';

/**
 * Datenschutz-Seite (Cockpit-Style, Schwester von /imprint).
 *
 * Bewusst konkret + ehrlich statt Juristen-Floskeln: was KBK speichert, warum,
 * und was NICHT passiert (kein Tracking). Deckt sich mit dem tatsächlichen Stand
 * des Codes (Security-Audit 15.07.2026). Name + E-Mail bleiben feste Daten.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.privacy');
  return {
    title: t('title'),
    description: t('description'),
  };
}

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

export default async function PrivacyPage() {
  const t = await getTranslations('privacy');

  return (
    <section
      style={{
        padding: '40px 24px',
        maxWidth: 760,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <SectionTitle sub="P" label={t('kicker')} title={t('title')} accent="green" />

      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'rgba(255,255,255,0.6)',
          lineHeight: 1.7,
          marginTop: 14,
          marginBottom: 28,
        }}
      >
        {t('intro')}
      </p>

      {/* Verantwortlich + Kontakt */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('responsibleHeading')}</h2>
        <p style={bodyText}>{t('responsibleBody', { name: 'Florian Winkler' })}</p>
        <p style={{ ...bodyText, marginTop: 12 }}>
          {t('contactLabel')}{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            style={{ color: '#3FCF4A', textDecoration: 'none', wordBreak: 'break-all' }}
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>

      {/* Welche Daten */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('dataHeading')}</h2>
        <p style={bodyText}>{t('dataBody')}</p>
      </section>

      {/* Sicherheit */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('securityHeading')}</h2>
        <p style={bodyText}>{t('securityBody')}</p>
      </section>

      {/* Cookies */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('cookiesHeading')}</h2>
        <p style={bodyText}>{t('cookiesBody')}</p>
      </section>

      {/* SoundCloud-Embeds (ADR-041): laden erst nach explizitem Play-Tap */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('soundcloudHeading')}</h2>
        <p style={bodyText}>{t('soundcloudBody')}</p>
      </section>

      {/* Kein Tracking */}
      <section
        style={{
          ...cardStyle,
          border: '1px solid rgba(63,207,74,0.4)',
        }}
      >
        <h2 style={{ ...sectionHeading, color: '#3FCF4A' }}>{t('trackingHeading')}</h2>
        <p style={bodyText}>{t('trackingBody')}</p>
      </section>

      {/* E-Mails */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('emailsHeading')}</h2>
        <p style={bodyText}>{t('emailsBody')}</p>
      </section>

      {/* OAuth (Discord / Twitch) */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('oauthHeading')}</h2>
        <p style={bodyText}>{t('oauthBody')}</p>
      </section>

      {/* Deine Rechte */}
      <section className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={sectionHeading}>{t('rightsHeading')}</h2>
        <p style={bodyText}>{t('rightsBody')}</p>
      </section>
    </section>
  );
}
