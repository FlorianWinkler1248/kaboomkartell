import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { SectionTitle } from '@/components/kbk/SectionTitle';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { isSafeExternalUrl, resolveMissionText } from '@/lib/mission-config';
import { showVanity } from '@/lib/vanity';

/**
 * Mission-Board (/mission) — das öffentliche „Blackboard" des Rudels (ADR-039).
 *
 * Server Component nach Imprint-Blaupause: Daten kommen direkt via prisma
 * (try/catch + Empty-Fallback wie WolfpackSection — DB-Ausfall zeigt leeres
 * Board statt 500). Missionen entstehen nur bei Flow (Admin-CRUD) und Boomy
 * (Secret-Route) — hier wird ausschließlich gelesen.
 *
 * Sichtbarkeit: status != ARCHIVED, sortiert nach sortOrder. PAUSED/COMPLETED
 * erscheinen mit Status-Badge. Fortschritt ist MANUELL gepflegt (Vanity-
 * Disziplin, keine Fake-Zähler); Balken cappt bei 100 %, Target 0/null
 * rendert keinen Prozentwert (keine Division durch 0).
 *
 * Dazu „FOLLOW THE PACK": admin-gepflegte SocialAccounts (isActive, sortOrder),
 * gruppiert nach ownerLabel — erweiterbar um künftige Künstler-Accounts.
 */

// DB-Daten pro Request — kein Build-Zeit-Prerender (CI hat keine DB-Daten).
export const dynamic = 'force-dynamic';

const GREEN = '#3FCF4A';
const RED = '#E63B2E';
const YELLOW = '#F5D02E';
const PURPLE = '#9F6BFF';

// Karten-Akzent + Badge-Farbe pro Missions-Typ.
const TYPE_COLOR: Record<string, string> = {
  DONATION: YELLOW,
  RECRUITING: GREEN,
  PARTNERSHIP: RED,
  GOAL: PURPLE,
};

// i18n-Sub-Key pro Missions-Typ (mission.type.*).
const TYPE_KEY: Record<string, 'donation' | 'recruiting' | 'partnership' | 'goal'> = {
  DONATION: 'donation',
  RECRUITING: 'recruiting',
  PARTNERSHIP: 'partnership',
  GOAL: 'goal',
};

// Plattform → Text-/Emoji-Icon (frei erweiterbar, Fallback = Ketten-Glyph).
const PLATFORM_ICON: Record<string, string> = {
  instagram: '📷',
  tiktok: '🎬',
  youtube: '▶',
  x: '𝕏',
  twitter: '𝕏',
  twitch: '🎮',
  discord: '💬',
  soundcloud: '☁',
  spotify: '🎧',
  bandcamp: '💿',
};

// Owner-Gruppen-Akzent: KBK grün, Boomy lila (AI-Akzent), Artists gelb.
function ownerColor(ownerLabel: string): string {
  const key = ownerLabel.toLowerCase();
  if (key === 'kbk') return GREEN;
  if (key === 'boomy') return PURPLE;
  return YELLOW;
}

const fmt = (n: number) => n.toLocaleString('en-US');

/** Fortschritts-Balken — nur wenn progressTarget gesetzt und > 0 (sonst
 *  kein Prozentwert). Balken cappt bei 100 %, Text zeigt die echten Zahlen. */
function MissionProgress({
  current,
  target,
  unit,
  label,
  color,
}: {
  current: number | null;
  target: number;
  unit: string | null;
  label: string;
  color: string;
}) {
  const cur = current ?? 0;
  const pct = Math.min(100, Math.max(0, Math.round((cur / target) * 100)));
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.6)',
          marginBottom: 4,
        }}
      >
        <span>{label}</span>
        <span style={{ color: '#fff' }}>
          {fmt(cur)} / {fmt(target)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            boxShadow: `0 0 8px ${color}80`,
          }}
        />
      </div>
    </div>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.mission');
  return {
    title: t('title'),
    description: t('description'),
  };
}

interface MissionCard {
  slug: string;
  title: string;
  type: string;
  summary: string;
  status: string;
  progressCurrent: number | null;
  progressTarget: number | null;
  progressUnit: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  createdBy: string;
  acceptedCount: number;
}

interface SocialItem {
  id: string;
  platform: string;
  handle: string;
  url: string;
  ownerLabel: string;
}

export default async function MissionBoardPage() {
  const t = await getTranslations('mission');
  // Aktives Locale aus dem kbk-locale-Cookie (ADR-031, i18n/request.ts) —
  // die Missions-INHALTE loest resolveMissionText feld-weise dagegen auf
  // (Fallback EN-Basisfelder bei fehlender/Teil-Uebersetzung).
  const locale = await getLocale();

  // Board-Daten — Empty-Fallback statt Crash (Muster WolfpackSection).
  let missions: MissionCard[] = [];
  try {
    const rows = await prisma.mission.findMany({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        slug: true,
        title: true,
        type: true,
        summary: true,
        status: true,
        progressCurrent: true,
        progressTarget: true,
        progressUnit: true,
        actionUrl: true,
        actionLabel: true,
        translations: true,
        createdBy: true,
        // Echte Mitwirkung zählen: ACCEPTED + COMPLETED (konsistent mit
        // /api/missions); WITHDRAWN bleibt als Audit-Zeile außen vor.
        _count: { select: { acceptances: { where: { status: { in: ['ACCEPTED', 'COMPLETED'] } } } } },
      },
    });
    missions = rows.map((m) => {
      // body wird auf dem Board nicht gerendert — der Resolver braucht ihn
      // aber als Pflichtfeld; leerer String ist hier ein neutraler Platzhalter.
      const text = resolveMissionText({ ...m, body: '' }, locale);
      return {
        slug: m.slug,
        title: text.title,
        type: m.type,
        summary: text.summary,
        status: m.status,
        progressCurrent: m.progressCurrent,
        progressTarget: m.progressTarget,
        progressUnit: m.progressUnit,
        actionUrl: m.actionUrl,
        actionLabel: text.actionLabel,
        createdBy: m.createdBy,
        acceptedCount: m._count.acceptances,
      };
    });
  } catch (err) {
    console.error('MissionBoard missions-query failed:', err);
    missions = [];
  }

  // Social-Liste — nur isActive, in sortOrder; Gruppierung nach ownerLabel.
  let socials: SocialItem[] = [];
  try {
    socials = await prisma.socialAccount.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, platform: true, handle: true, url: true, ownerLabel: true },
    });
  } catch (err) {
    console.error('MissionBoard socials-query failed:', err);
    socials = [];
  }

  // Render-Guard (zod sichert nur den Write-Pfad): Accounts ohne http(s)-URL
  // werden gar nicht erst gelistet — kein javascript:-href aus Bestandsdaten.
  socials = socials.filter((s) => isSafeExternalUrl(s.url));

  const socialGroups = new Map<string, SocialItem[]>();
  for (const s of socials) {
    const group = socialGroups.get(s.ownerLabel) ?? [];
    group.push(s);
    socialGroups.set(s.ownerLabel, group);
  }

  return (
    <section
      style={{
        padding: '40px 24px',
        maxWidth: 1080,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <SectionTitle sub="M" label={t('kicker')} title={t('title')} accent="green" />

      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'rgba(255,255,255,0.65)',
          lineHeight: 1.7,
          marginTop: 14,
          marginBottom: 28,
          maxWidth: 660,
        }}
      >
        {t('intro')}
      </p>

      {/* Missions-Grid */}
      {missions.length === 0 ? (
        <div className="kbk-obsidian framed" style={{ padding: 28, textAlign: 'center' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'rgba(255,255,255,0.6)',
              margin: 0,
            }}
          >
            {t('empty')}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          {missions.map((m) => {
            const color = TYPE_COLOR[m.type] ?? GREEN;
            const hasProgress = m.progressTarget != null && m.progressTarget > 0;
            // Fortschritt ohne Ziel → absoluter Zähler statt gar nichts;
            // der BALKEN bleibt Target-pflichtig (kein Prozent ohne Ziel).
            const hasAbsoluteProgress = !hasProgress && (m.progressCurrent ?? 0) > 0;
            return (
              <div
                key={m.slug}
                className="kbk-obsidian framed"
                style={{
                  ...obsidianFrameVars(color),
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {/* Badge-Zeile: Typ + Status + Boomy-Attribution */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      fontWeight: 700,
                      color,
                      border: `1px solid ${color}80`,
                      padding: '2px 8px',
                      letterSpacing: '0.15em',
                    }}
                  >
                    {t(`type.${TYPE_KEY[m.type] ?? 'goal'}`)}
                  </span>
                  {m.status === 'PAUSED' && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: YELLOW,
                        border: `1px solid ${YELLOW}60`,
                        padding: '2px 8px',
                        letterSpacing: '0.15em',
                      }}
                    >
                      {t('statusPaused')}
                    </span>
                  )}
                  {m.status === 'COMPLETED' && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: GREEN,
                        border: `1px solid ${GREEN}60`,
                        padding: '2px 8px',
                        letterSpacing: '0.15em',
                      }}
                    >
                      {t('statusCompleted')}
                    </span>
                  )}
                  {m.createdBy === 'boomy' && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: PURPLE,
                        letterSpacing: '0.1em',
                      }}
                    >
                      {t('calledByBoomy')}
                    </span>
                  )}
                </div>

                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    fontWeight: 900,
                    color: '#fff',
                    letterSpacing: '0.04em',
                    margin: 0,
                    textTransform: 'uppercase',
                  }}
                >
                  {m.title}
                </h3>

                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.65)',
                    lineHeight: 1.55,
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {m.summary}
                </p>

                {hasProgress && (
                  <MissionProgress
                    current={m.progressCurrent}
                    target={m.progressTarget as number}
                    unit={m.progressUnit}
                    label={t('progressLabel')}
                    color={color}
                  />
                )}

                {/* Absoluter Fortschritt ohne Ziel — nur die echte Zahl. */}
                {hasAbsoluteProgress && (
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      color: 'rgba(255,255,255,0.6)',
                    }}
                  >
                    <span>{t('progressLabel')}</span>
                    <span style={{ color: '#fff' }}>
                      {t('progressAbsolute', {
                        value: `${fmt(m.progressCurrent as number)}${m.progressUnit ? ` ${m.progressUnit}` : ''}`,
                      })}
                    </span>
                  </div>
                )}

                {/* Fuß-Zeile: Detail-Link + Action-Button/Platzhalter + Zähler */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                    marginTop: 6,
                  }}
                >
                  <Link
                    href={`/mission/${m.slug}`}
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: '0.12em',
                      color,
                      textDecoration: 'none',
                      padding: '8px 0',
                    }}
                  >
                    {t('viewMission')}
                  </Link>
                  <div style={{ flex: 1 }} />
                  {/* Render-Guard: nur http(s)-URLs werden zum href (zod
                      sichert nur den Write-Pfad, Seeds/Bestandsdaten nicht). */}
                  {isSafeExternalUrl(m.actionUrl) ? (
                    <a
                      href={m.actionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: '0.1em',
                        color: '#0A0B0C',
                        background: color,
                        padding: '8px 14px',
                        textDecoration: 'none',
                        clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.actionLabel || t('actionDefault')}
                    </a>
                  ) : (
                    // Platzhalter-Zustand NUR fuer Donation ohne Link — kein
                    // toter Button (Flow trägt die URL im Admin nach).
                    m.type === 'DONATION' && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: 'rgba(255,255,255,0.45)',
                          border: '1px dashed rgba(255,255,255,0.25)',
                          padding: '4px 8px',
                          letterSpacing: '0.1em',
                        }}
                      >
                        {t('linkComingSoon')}
                      </span>
                    )
                  )}
                </div>

                {/* Annahme-Zähler hide-until-threshold (zentrale Schwelle in
                    VANITY_MIN.missionAcceptances — Vanity-Disziplin). */}
                {showVanity(m.acceptedCount, 'missionAcceptances') && (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.5)',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {t('acceptedCount', { count: m.acceptedCount })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* FOLLOW THE PACK — Social-Accounts, gruppiert nach ownerLabel */}
      <div style={{ marginTop: 48 }}>
        <SectionTitle sub="F" label={t('follow.kicker')} title={t('follow.title')} accent="yellow" />
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.7,
            marginTop: 14,
            marginBottom: 24,
            maxWidth: 660,
          }}
        >
          {t('follow.intro')}
        </p>

        {socials.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'rgba(255,255,255,0.4)',
              letterSpacing: '0.1em',
            }}
          >
            {t('follow.empty')}
          </p>
        ) : (
          Array.from(socialGroups.entries()).map(([owner, accounts]) => {
            const color = ownerColor(owner);
            return (
              <div key={owner} style={{ marginBottom: 22 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      fontWeight: 700,
                      color,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {owner}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: `linear-gradient(90deg, ${color}40, transparent)`,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 10,
                  }}
                >
                  {accounts.map((s) => (
                    <a
                      key={s.id}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="kbk-obsidian framed"
                      style={{
                        ...obsidianFrameVars(color),
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        textDecoration: 'none',
                      }}
                    >
                      <span style={{ fontSize: 18, flexShrink: 0 }} aria-hidden="true">
                        {PLATFORM_ICON[s.platform.toLowerCase()] ?? '🔗'}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color,
                            letterSpacing: '0.15em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {s.platform}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: '#fff',
                            fontWeight: 700,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {s.handle}
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
