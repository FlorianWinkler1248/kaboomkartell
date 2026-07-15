import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import LogoMark from '@/components/kbk/LogoMark';
import prisma from '@/lib/db';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import {
  IcoTrack,
  IcoUsers,
  IcoCans,
  IcoRadio,
  IcoMap,
  IcoZap,
  IcoHeart,
  IcoStar,
} from '@/components/kbk/icons';
import DanceSprite from '@/components/kbk/DanceSprite';
import { obsidianFrameVars } from '@/lib/obsidian-frame';

/**
 * About-Seite (Cockpit-Style).
 *
 * Live-Stats aus DB, Sections im /Nr/ LABEL Pattern, Cards im
 * Cockpit-Look (rgba 0.85 + Akzent-Border).
 *
 * i18n: Namespace `about`. Markenbegriffe (KaboomKartell, 4Flow, KBK,
 * Make Noise Together, Genre-Namen) bleiben in den Strings unuebersetzt,
 * Live-Stats kommen als {Variablen} rein.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.about');
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

async function getStats() {
  try {
    const [trackCount, artistCount, totalPlays] = await Promise.all([
      prisma.track.count({ where: { isPublic: true } }),
      prisma.user.count({ where: { role: 'KUENSTLER' } }),
      prisma.track.aggregate({
        where: { isPublic: true },
        _sum: { playCount: true },
      }),
    ]);

    return {
      tracks: trackCount,
      artists: artistCount,
      plays: totalPlays._sum.playCount || 0,
    };
  } catch {
    return { tracks: 0, artists: 0, plays: 0 };
  }
}

export default async function AboutPage() {
  const stats = await getStats();
  const t = await getTranslations('about');

  const features = [
    {
      Icon: IcoTrack,
      title: t('feature1Title'),
      desc: t('feature1Desc'),
    },
    {
      Icon: IcoStar,
      title: t('feature2Title'),
      desc: t('feature2Desc'),
    },
    {
      Icon: IcoRadio,
      title: t('feature3Title'),
      desc: t('feature3Desc'),
    },
    {
      Icon: IcoMap,
      title: t('feature4Title'),
      desc: t('feature4Desc'),
    },
    {
      Icon: IcoZap,
      title: t('feature5Title'),
      desc: t('feature5Desc'),
    },
    {
      Icon: IcoHeart,
      title: t('feature6Title'),
      desc: t('feature6Desc'),
    },
  ];

  return (
    <section style={{ padding: '40px 24px' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <LogoMark size={180} intensity={1} />
        </div>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#3FCF4A',
            letterSpacing: '0.2em',
            margin: '0 0 12px',
          }}
        >
          {t('heroKicker')}
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(36px, 6vw, 72px)',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            lineHeight: 0.95,
            color: '#fff',
            margin: 0,
            textTransform: 'uppercase',
          }}
        >
          {t.rich('heroTitle', {
            brand: (chunks) => (
              <span
                style={{
                  color: '#3FCF4A',
                  textShadow: '0 0 30px #3FCF4A',
                }}
              >
                {chunks}
              </span>
            ),
            q: (chunks) => <span style={{ color: '#E63B2E' }}>{chunks}</span>,
          })}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            color: 'rgba(255,255,255,0.7)',
            maxWidth: 640,
            margin: '20px auto 0',
            lineHeight: 1.6,
          }}
        >
          {t.rich('heroSubtitle', {
            br: () => <br />,
            founder: (chunks) => (
              <strong style={{ color: '#fff' }}>{chunks}</strong>
            ),
          })}
        </p>
      </div>

      {/* Live Stats */}
      <div
        className="kbk-subpage-grid-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
          marginBottom: 56,
          maxWidth: 720,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        {[
          { v: stats.tracks, k: 'tracks', l: t('statTracks'), c: '#3FCF4A', Icon: IcoTrack },
          { v: stats.artists, k: 'artists', l: t('statArtists'), c: '#F5D02E', Icon: IcoUsers },
          { v: stats.plays, k: 'plays', l: t('statPlays'), c: '#E63B2E', Icon: IcoCans },
        ].map((s) => (
          <div
            key={s.k}
            className="kbk-obsidian framed"
            style={{
              ...obsidianFrameVars(s.c),
              padding: 24,
              textAlign: 'center',
            }}
          >
            <s.Icon size={28} style={{ color: s.c }} />
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 36,
                fontWeight: 900,
                color: s.c,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                marginTop: 10,
              }}
            >
              {s.v}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'rgba(255,255,255,0.5)',
                letterSpacing: '0.2em',
                marginTop: 6,
              }}
            >
              {s.l}
            </div>
          </div>
        ))}
      </div>

      {/* The Kartell */}
      <div style={{ marginBottom: 48 }}>
        <SectionTitle sub="01" label={t('kartellLabel')} title={t('kartellTitle')} accent="green" />
        <div
          className="kbk-obsidian framed"
          style={{
            padding: 28,
            marginTop: 24,
            maxWidth: 760,
            marginLeft: 'auto',
            marginRight: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            color: 'rgba(255,255,255,0.78)',
            lineHeight: 1.7,
          }}
        >
          <p style={{ margin: '0 0 16px' }}>
            {t.rich('kartellPara1', {
              b: (chunks) => <strong style={{ color: '#fff' }}>{chunks}</strong>,
            })}
          </p>
          <p style={{ margin: '0 0 16px' }}>
            {t('kartellPara2')}
          </p>
          <p style={{ margin: 0 }}>
            {t('kartellPara3')}
          </p>
        </div>
      </div>

      {/* The Vision */}
      <div style={{ marginBottom: 48 }}>
        <SectionTitle sub="02" label={t('visionLabel')} title={t('visionTitle')} accent="yellow" />
        <div
          className="kbk-obsidian framed kbk-frame-yellow"
          style={{
            padding: 28,
            marginTop: 24,
            maxWidth: 760,
            marginLeft: 'auto',
            marginRight: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            color: 'rgba(255,255,255,0.78)',
            lineHeight: 1.7,
          }}
        >
          <p style={{ margin: '0 0 16px' }}>
            {t.rich('visionPara1', {
              b: (chunks) => <strong style={{ color: '#fff' }}>{chunks}</strong>,
            })}
          </p>
          <p style={{ margin: 0 }}>
            {t.rich('visionPara2', {
              accent: (chunks) => (
                <strong style={{ color: '#3FCF4A' }}>{chunks}</strong>
              ),
            })}
          </p>
        </div>
      </div>

      {/* The Founder */}
      <div style={{ marginBottom: 48 }}>
        <SectionTitle sub="03" label={t('founderLabel')} title={t('founderTitle')} accent="red" />
        <div
          className="kbk-obsidian framed kbk-frame-red"
          style={{
            padding: 28,
            marginTop: 24,
            maxWidth: 760,
            marginLeft: 'auto',
            marginRight: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            color: 'rgba(255,255,255,0.78)',
            lineHeight: 1.7,
          }}
        >
          <p style={{ margin: '0 0 16px' }}>
            {t.rich('founderPara1', {
              b: (chunks) => <strong style={{ color: '#fff' }}>{chunks}</strong>,
            })}
          </p>
          <p style={{ margin: '0 0 16px' }}>
            {t('founderPara2')}
          </p>
          <p style={{ margin: 0 }}>
            {t('founderPara3')}
          </p>
        </div>
      </div>

      {/* Features Grid */}
      <div style={{ marginBottom: 48 }}>
        <SectionTitle sub="04" label={t('featuresLabel')} title={t('featuresTitle')} accent="green" />
        <div
          className="kbk-subpage-grid-3"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14,
            marginTop: 24,
          }}
        >
          {features.map((feat) => (
            <div
              key={feat.title}
              className="kbk-obsidian framed"
              style={{
                padding: 22,
              }}
            >
              <feat.Icon size={28} style={{ color: '#3FCF4A' }} />
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 14,
                  fontWeight: 900,
                  color: '#fff',
                  letterSpacing: '0.1em',
                  margin: '12px 0 6px',
                }}
              >
                {feat.title}
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.6)',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {feat.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div
        className="kbk-obsidian framed kbk-frame-red"
        style={{
          padding: 36,
          textAlign: 'center',
          maxWidth: 760,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#E63B2E',
            letterSpacing: '0.2em',
            margin: '0 0 12px',
          }}
        >
          {t('ctaKicker')}
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 4vw, 44px)',
            fontWeight: 900,
            letterSpacing: '-0.01em',
            lineHeight: 0.95,
            color: '#fff',
            margin: '0 0 14px',
            textTransform: 'uppercase',
          }}
        >
          {t.rich('ctaTitle', {
            br: () => <br />,
            accent: (chunks) => (
              <span style={{ color: '#E63B2E', textShadow: '0 0 30px #E63B2E' }}>
                {chunks}
              </span>
            ),
          })}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'rgba(255,255,255,0.7)',
            maxWidth: 480,
            margin: '0 auto 24px',
            lineHeight: 1.6,
          }}
        >
          {t('ctaBody')}
        </p>
        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/register"
            style={{
              background: '#3FCF4A',
              color: '#0A0B0C',
              padding: '14px 24px',
              minHeight: 44,
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 13,
              letterSpacing: '0.1em',
              textDecoration: 'none',
              boxShadow:
                '0 0 20px rgba(63,207,74,0.5), inset 0 0 0 2px #0A0B0C',
              clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
            }}
          >
            {t('ctaJoinButton')}
          </Link>
          <Link
            href="/library"
            style={{
              background: 'transparent',
              color: '#fff',
              padding: '14px 22px',
              minHeight: 44,
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: '0.1em',
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <IcoCans size={16} /> {t('ctaListenButton')}
          </Link>
        </div>
      </div>

      {/* moth + knight tanzen in der Leerstelle unter dem CTA — ein dezenter
          „join the party"-Ausklang, rein dekorativ, ohne Rahmen/Linien und
          nicht auf der Karte (Design-Regel Dance-Sprites). */}
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: 12 }}
        aria-hidden="true"
      >
        <DanceSprite name="moth" size={48} bobDelayMs={-300} />
        <DanceSprite name="knight" size={52} bobDelayMs={-900} />
      </div>
    </section>
  );
}
