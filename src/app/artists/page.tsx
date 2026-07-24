import DanceSprite from '@/components/kbk/DanceSprite';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import prisma from '@/lib/db';
import { isBotUser, BOOMY_CONFIG } from '@/lib/constants';
import ArtistHoverCard from '@/components/artists/ArtistHoverCard';
import { ArtistsLiveStreamCard } from '@/components/twitch/ArtistsLiveStreamCard';
import { SafeImg } from '@/components/ui/SafeImg';

// v2.26 (07.05.2026): Page muss dynamisch gerendert werden, damit der
// Audio-Snippet-Pfad (artistTracks-Subselect) live aus der DB kommt.
// Static-Build-Cache könnte sonst leere Crew-Liste festsetzen.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.artists');
  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
    },
  };
}

interface ArtistData {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: string;
  trackCount: number;
  /** v2.26: Stream-URL eines repraesentativen Tracks für Audio-Snippet-Hover. */
  snippetUrl: string | null;
}

async function loadArtists() {
  const usersWithTracks = await prisma.user.findMany({
    where: {
      OR: [
        { artistTracks: { some: {} } },
        { username: BOOMY_CONFIG.username },
        { role: 'ADMIN' },
      ],
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      role: true,
      // v2.26.5: featuringTracks mitzaehlen — Boomy bekommt seine Hardphonk-Sets
      // dann auch im trackCount sichtbar, nicht nur Solo-Releases.
      _count: { select: { artistTracks: true, featuringTracks: true } },
      // v2.26 (07.05.2026): Erster oeffentlicher LOCAL-Track als Audio-Snippet-Source
      // für den /artists-Hover-Effekt. Frontend-Component (ArtistHoverCard)
      // spielt 4 Sekunden ab — User bekommt eine Kost-Probe ohne erst aufs Profil
      // zu gehen.
      artistTracks: {
        where: { isPublic: true, trackType: 'LOCAL' },
        orderBy: { publishedAt: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
    orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
  });

  return usersWithTracks.map(
    (u): ArtistData => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      role: u.role,
      trackCount: u._count.artistTracks + u._count.featuringTracks,
      snippetUrl: u.artistTracks[0]
        ? `/api/tracks/${u.artistTracks[0].id}/stream`
        : null,
    })
  );
}

// Extended Family (ADR-041): externe Künstler mit veröffentlichtem
// ArtistProfile — kuratiert von Flow, verlinkt auf /artists/[slug].
async function loadExtendedFamily() {
  return prisma.artistProfile.findMany({
    where: { isPublished: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      bio: true,
      avatarUrl: true,
    },
  });
}

const GREEN = '#3FCF4A';
const RED = '#E63B2E';
const YELLOW = '#F5D02E';
const PURPLE = '#9F6BFF';

const cardBase: React.CSSProperties = {
  padding: 28,
  marginBottom: 14,
};

const bodyText: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  color: 'rgba(255,255,255,0.78)',
  lineHeight: 1.7,
};

function MiniHeader({ sub, label, color }: { sub: string; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 16 }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color,
          letterSpacing: '0.2em',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        /{sub}/ {label}
      </span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}40, transparent)` }} />
    </div>
  );
}

// v2.26 (07.05.2026): ArtistCard ersetzt durch Client-Component
// `ArtistHoverCard`, die Audio-Snippet-Hover + Pulse-Border + Live-Indicator
// + Staggered-Fade-In rendert. Wird unten im JSX direkt importiert + verwendet.

export default async function PackPage() {
  const t = await getTranslations('artists');
  const tPub = await getTranslations('artistsPublic');
  const [artists, extendedFamily] = await Promise.all([loadArtists(), loadExtendedFamily()]);
  const founder = artists.find((a) => a.role === 'ADMIN');
  const aiResident = artists.find((a) => isBotUser(a.username));
  const externals = artists.filter((a) => a.id !== founder?.id && a.id !== aiResident?.id);

  return (
    <main style={{ padding: '40px 24px', maxWidth: 880, marginInline: 'auto' }}>
      {/* HOVER + VOLT feiern in der Leerstelle rechts vom Titel — neutral,
          ohne Rahmen/Linien (Design-Regel 12.07.). */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: -6, marginBottom: 4 }}>
        <DanceSprite name="robo-hover" size={48} bobDelayMs={-300} />
        <DanceSprite name="robo-volt" size={52} bobDelayMs={-900} />
      </div>
      {/* Hero */}
      <div style={{ marginBottom: 40 }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: GREEN,
            letterSpacing: '0.25em',
            margin: '0 0 12px',
          }}
        >
          /02/ {t('kicker')}
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(34px, 6vw, 56px)',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            lineHeight: 0.95,
            color: '#fff',
            margin: 0,
            textTransform: 'uppercase',
          }}
        >
          {t('headlineLead')}{' '}
          <span style={{ color: GREEN, textShadow: `0 0 30px ${GREEN}` }}>PACK</span>{' '}
          {t('headlineTrail')}
        </h1>
        <p
          style={{
            ...bodyText,
            maxWidth: 640,
            marginTop: 18,
            fontSize: 14,
          }}
        >
          {t('heroSubtitle')}
        </p>
      </div>

      {/* Founder + AI als prominente Doppelkarte */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
          marginBottom: 56,
        }}
      >
        {founder && (
          <ArtistHoverCard
            username={founder.username}
            name={founder.displayName || founder.username}
            badgeLabel={t('badgeFounderHost')}
            accent={YELLOW}
            avatarUrl={founder.avatarUrl}
            snippetUrl={founder.snippetUrl}
            trackCount={founder.trackCount}
            index={0}
          />
        )}
        {aiResident && (
          <ArtistHoverCard
            username={aiResident.username}
            name={aiResident.displayName || aiResident.username}
            badgeLabel={t('badgeAiResidentWatchdog')}
            accent={PURPLE}
            avatarUrl={aiResident.avatarUrl}
            snippetUrl={aiResident.snippetUrl}
            trackCount={aiResident.trackCount}
            alwaysLive
            index={1}
          />
        )}
      </div>

      {/* Modul 1 — 4Flow: Der Mensch */}
      <section className="kbk-obsidian framed kbk-frame-yellow" style={cardBase}>
        <MiniHeader sub="01" label={`4FLOW · ${t('m1Label')}`} color={YELLOW} />
        <div style={bodyText}>
          <p style={{ margin: '0 0 14px' }}>{t('m1p1')}</p>
          <p style={{ margin: '0 0 14px' }}>{t('m1p2')}</p>
          <p style={{ margin: '0 0 14px' }}>{t('m1p3')}</p>
          <p style={{ margin: '0 0 14px' }}>{t('m1p4')}</p>
          <p style={{ margin: 0 }}>{t('m1p5')}</p>
        </div>
      </section>

      {/* Modul 2 — Der Sound */}
      <section className="kbk-obsidian framed kbk-frame-red" style={cardBase}>
        <MiniHeader sub="02" label={t('m2Label')} color={RED} />
        <div style={bodyText}>
          <p style={{ margin: '0 0 14px' }}>
            {t.rich('m2p1', {
              b: (chunks) => <strong style={{ color: '#fff' }}>{chunks}</strong>,
            })}
          </p>
          <p style={{ margin: '0 0 14px' }}>{t('m2p2')}</p>
          <p style={{ margin: 0 }}>
            {t.rich('m2p3', {
              b: (chunks) => <strong style={{ color: '#fff' }}>{chunks}</strong>,
              i: (chunks) => <em style={{ color: 'rgba(255,255,255,0.9)' }}>{chunks}</em>,
            })}
          </p>
        </div>
      </section>

      {/* Modul 3 — Das KaboomKartell */}
      <section className="kbk-obsidian framed" style={cardBase}>
        <MiniHeader sub="03" label={t('m3Label')} color={GREEN} />
        <div style={bodyText}>
          <p style={{ margin: '0 0 14px' }}>
            {t.rich('m3p1', {
              b: (chunks) => <strong style={{ color: '#fff' }}>{chunks}</strong>,
            })}
          </p>
          <p style={{ margin: '0 0 14px' }}>{t('m3p2')}</p>
          <p style={{ margin: '0 0 14px' }}>{t('m3p3')}</p>
          {/* Marken-Slogan — bleibt unübersetzt (Markenbegriff). */}
          <p style={{ margin: 0, color: GREEN, fontWeight: 700, letterSpacing: '0.08em' }}>
            Make noise together.
          </p>
        </div>
      </section>

      {/* Modul 4 — Die Vision */}
      <section className="kbk-obsidian framed" style={{ ...cardBase, ...obsidianFrameVars(PURPLE) }}>
        <MiniHeader sub="04" label={t('m4Label')} color={PURPLE} />
        <div style={bodyText}>
          <p style={{ margin: '0 0 14px' }}>{t('m4p1')}</p>
          <p style={{ margin: '0 0 14px' }}>
            {t.rich('m4p2', {
              b: (chunks) => <strong style={{ color: '#fff' }}>{chunks}</strong>,
            })}
          </p>
          <p style={{ margin: '0 0 14px' }}>{t('m4p3')}</p>
          <p style={{ margin: 0 }}>{t('m4p4')}</p>
        </div>
      </section>

      {/* Crew — externe Artists */}
      {externals.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <MiniHeader sub="05" label={t('crewLabel')} color={GREEN} />
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.1em',
              marginBottom: 14,
            }}
          >
            {t('crewIntro')}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {externals.map((a, i) => (
              <ArtistHoverCard
                key={a.id}
                username={a.username}
                name={a.displayName || a.username}
                badgeLabel={t('badgeCrew')}
                accent={GREEN}
                avatarUrl={a.avatarUrl}
                snippetUrl={a.snippetUrl}
                trackCount={a.trackCount}
                index={i + 2}
              />
            ))}
          </div>
        </section>
      )}

      {/* Extended Family — externe Künstler mit eigenem ArtistProfile
          (ADR-041). Nur rendern, wenn veröffentlichte Profile existieren. */}
      {extendedFamily.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <MiniHeader
            sub="XF"
            label={`${tPub('extendedFamilyKicker')} · ${tPub('extendedFamilyTitle')}`}
            color={GREEN}
          />
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.1em',
              marginBottom: 14,
            }}
          >
            {tPub('extendedFamilyHint')}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {extendedFamily.map((profile) => (
              <Link
                key={profile.id}
                href={`/artists/${profile.slug}`}
                className="kbk-obsidian polished"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  minHeight: 72,
                  textDecoration: 'none',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    flexShrink: 0,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: `1px solid ${GREEN}55`,
                    background: 'rgba(255,255,255,0.06)',
                  }}
                >
                  <SafeImg
                    src={profile.avatarUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    fallback={
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-display)',
                          fontSize: 20,
                          fontWeight: 900,
                          color: GREEN,
                        }}
                      >
                        {profile.name.charAt(0).toUpperCase()}
                      </div>
                    }
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 14,
                      fontWeight: 900,
                      color: '#fff',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {profile.name}
                  </div>
                  {/* Erste Bio-Zeile als Teaser */}
                  {profile.bio && (
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.55)',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        marginTop: 3,
                      }}
                    >
                      {profile.bio.split('\n')[0]}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Modul 6 — Live & Streaming (Twitch-Live-Status, v2.30) */}
      <section style={{ marginTop: 56 }}>
        <MiniHeader sub="06" label={t('liveStreamsLabel')} color={RED} />
        <ArtistsLiveStreamCard />
      </section>
    </main>
  );
}
