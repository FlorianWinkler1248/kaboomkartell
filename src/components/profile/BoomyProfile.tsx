import Link from 'next/link';
import {
  Bot,
  Headphones,
  Filter,
  Lightbulb,
  Sparkles,
  Music2,
  Radio,
  MessageCircle,
  Shield,
  ShieldCheck,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { SafeImg } from '@/components/ui/SafeImg';

/**
 * BoomyProfile — Spezialprofil für den AI-Residenten Boomy.
 *
 * v2.26 (07.05.2026): Migration auf Obsidian/Vulkanglas-Layer (BOOMY_PURPLE),
 * 3-Stufen-Responsive (Mobile / Tablet 768-1023 / Desktop), Texte cooler +
 * persona-treuer. Vorher Tailwind-Cards mit `bg-surface border-border`.
 *
 * Wird aus profile/[username]/page.tsx aufgerufen, wenn
 * isBotUser(user.username) === true.
 */

interface BoomyProfileProps {
  user: {
    username: string;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    createdAt: Date;
    socialSoundcloud: string | null;
    socialInstagram: string | null;
    socialTelegram: string | null;
    socialWebsite: string | null;
    artistTracks: Array<{
      title: string;
      slug: string;
      genre: string | null;
      trackType: string;
      coverUrl: string | null;
      soundcloudArtwork: string | null;
      // v2.26.5: Wenn gesetzt, ist Boomy hier nur als Featuring-Artist —
      // Hauptartist (z.B. 4Flow auf Hardphonk-Sets) wird im UI als "feat. with X" angezeigt.
      featuringMain?: { username: string; displayName: string | null } | null;
    }>;
    wallPosts: Array<{
      id: string;
      content: string;
      createdAt: Date;
    }>;
  };
  totalTrackCount: number;
}

const BOOMY_PURPLE = '#8B5CF6';
const TRUST_GREEN = '#3FCF4A';

export default async function BoomyProfile({ user, totalTrackCount }: BoomyProfileProps) {
  const t = await getTranslations('boomy.profile');
  const displayName = user.displayName || user.username;
  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const hasSocials =
    user.socialSoundcloud || user.socialInstagram || user.socialTelegram || user.socialWebsite;

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: '0 auto',
        padding: '32px 16px 56px',
      }}
    >
      {/* Hero — Vulkanglas mit Boomy-Lila-Frame */}
      <section
        className="kbk-obsidian framed"
        style={{
          ...obsidianFrameVars(BOOMY_PURPLE),
          padding: 28,
          borderRadius: 18,
          marginBottom: 28,
        }}
      >
        <div className="boomy-hero-grid">
          {/* Avatar mit pulsing dot */}
          <div className="boomy-avatar-wrap">
            <div
              className="kbk-obsidian polished"
              style={{
                ...obsidianFrameVars(BOOMY_PURPLE),
                width: 'clamp(112px, 18vw, 168px)',
                height: 'clamp(112px, 18vw, 168px)',
                borderRadius: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 36px rgba(139,92,246,0.25)',
                overflow: 'hidden',
              }}
            >
              {user.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={user.avatarUrl}
                  alt={displayName}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <Bot size={64} color={BOOMY_PURPLE} />
              )}
            </div>
            <span className="boomy-live-dot" aria-label="online">
              <span className="boomy-live-dot__ping" />
              <span className="boomy-live-dot__core" />
            </span>
          </div>

          {/* Hero-Text */}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.22em',
                color: 'rgba(180,140,255,0.85)',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {t('eyebrow')}
            </div>
            <h1
              className="font-heading"
              style={{
                fontSize: 'clamp(28px, 5vw, 52px)',
                fontWeight: 900,
                margin: 0,
                background: 'linear-gradient(135deg,#E5DAFF 0%,#B69DFF 45%,#7B5CFF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                color: 'transparent',
                letterSpacing: '0.02em',
                lineHeight: 1.05,
              }}
            >
              {displayName}
            </h1>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'rgba(255,255,255,0.55)',
                marginTop: 4,
              }}
            >
              @{user.username}
            </div>

            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                color: 'rgba(255,255,255,0.85)',
                lineHeight: 1.6,
                margin: '14px 0 0 0',
                maxWidth: 580,
              }}
            >
              {t('heroTagline')}
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 14,
                marginTop: 16,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'rgba(255,255,255,0.55)',
                letterSpacing: '0.05em',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={12} /> {t('memberSince', { date: memberSince })}
              </span>
              {totalTrackCount > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Music2 size={12} /> {t('tracksReleased', { count: totalTrackCount })}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Who I Am */}
      <section
        className="kbk-obsidian framed"
        style={{
          ...obsidianFrameVars(BOOMY_PURPLE),
          padding: 24,
          borderRadius: 16,
          marginBottom: 20,
        }}
      >
        <h2
          className="font-heading"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 18,
            fontWeight: 800,
            margin: '0 0 12px 0',
            color: '#fff',
            letterSpacing: '0.02em',
          }}
        >
          <Sparkles size={18} color={BOOMY_PURPLE} /> {t('whoHeading')}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            color: 'rgba(255,255,255,0.82)',
            lineHeight: 1.75,
            margin: 0,
          }}
        >
          {t('whoBody')}
        </p>
      </section>

      {/* What I Do — 3 Cards */}
      <section style={{ marginBottom: 20 }}>
        <h2
          className="font-heading"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 18,
            fontWeight: 800,
            margin: '0 0 14px 0',
            color: '#fff',
            letterSpacing: '0.02em',
          }}
        >
          <Headphones size={18} color={BOOMY_PURPLE} /> {t('doHeading')}
        </h2>
        <div className="boomy-three-grid">
          <div
            className="kbk-obsidian polished"
            style={{
              ...obsidianFrameVars(BOOMY_PURPLE),
              padding: 22,
              borderRadius: 14,
              minHeight: 196,
            }}
          >
            <div
              className="kbk-obsidian polished"
              style={{
                ...obsidianFrameVars(BOOMY_PURPLE),
                width: 48,
                height: 48,
                borderRadius: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <Filter size={22} color={BOOMY_PURPLE} />
            </div>
            <h3
              className="font-heading"
              style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px 0', color: '#fff' }}
            >
              {t('card1Title')}
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {t('card1Body')}
            </p>
          </div>

          <div
            className="kbk-obsidian polished"
            style={{
              ...obsidianFrameVars(BOOMY_PURPLE),
              padding: 22,
              borderRadius: 14,
              minHeight: 196,
            }}
          >
            <div
              className="kbk-obsidian polished"
              style={{
                ...obsidianFrameVars(BOOMY_PURPLE),
                width: 48,
                height: 48,
                borderRadius: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <Lightbulb size={22} color={BOOMY_PURPLE} />
            </div>
            <h3
              className="font-heading"
              style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px 0', color: '#fff' }}
            >
              {t('card2Title')}
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {t('card2Body')}
            </p>
          </div>

          <div
            className="kbk-obsidian polished"
            style={{
              ...obsidianFrameVars(BOOMY_PURPLE),
              padding: 22,
              borderRadius: 14,
              minHeight: 196,
              position: 'relative',
            }}
          >
            <div
              className="kbk-obsidian polished"
              style={{
                ...obsidianFrameVars(BOOMY_PURPLE),
                width: 48,
                height: 48,
                borderRadius: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <ShieldCheck size={22} color={BOOMY_PURPLE} />
            </div>
            <h3
              className="font-heading"
              style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px 0', color: '#fff' }}
            >
              {t('card3Title')}
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {t('card3Body')}
            </p>
          </div>
        </div>
      </section>

      {/* AI Transparency — Trust-Block in grüner Note */}
      <section
        className="kbk-obsidian framed"
        style={{
          ...obsidianFrameVars(TRUST_GREEN),
          padding: 24,
          borderRadius: 16,
          marginBottom: 20,
        }}
      >
        <h2
          className="font-heading"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 18,
            fontWeight: 800,
            margin: '0 0 12px 0',
            color: '#fff',
            letterSpacing: '0.02em',
          }}
        >
          <Shield size={18} color={TRUST_GREEN} /> {t('rulesHeading')}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            color: 'rgba(255,255,255,0.82)',
            lineHeight: 1.75,
            margin: 0,
          }}
        >
          {t.rich('rulesBody', {
            mark: (chunks) => (
              <span style={{ color: TRUST_GREEN, fontWeight: 700 }}>{chunks}</span>
            ),
          })}
        </p>
      </section>

      {/* My Stages */}
      <section style={{ marginBottom: 20 }}>
        <h2
          className="font-heading"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 18,
            fontWeight: 800,
            margin: '0 0 14px 0',
            color: '#fff',
            letterSpacing: '0.02em',
          }}
        >
          <Sparkles size={18} color={BOOMY_PURPLE} /> {t('stagesHeading')}
        </h2>
        <div className="boomy-stages-grid">
          <Link
            href="/library"
            className="kbk-obsidian polished"
            style={{
              ...obsidianFrameVars(TRUST_GREEN),
              padding: 18,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              textDecoration: 'none',
              color: '#fff',
            }}
          >
            <div
              className="kbk-obsidian polished"
              style={{
                ...obsidianFrameVars(TRUST_GREEN),
                width: 44,
                height: 44,
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Radio size={20} color={TRUST_GREEN} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="font-heading"
                style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}
              >
                KaboomKartell
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                {t('stageKbkSub')}
              </div>
            </div>
            <ExternalLink size={14} color="rgba(255,255,255,0.4)" />
          </Link>

          <div
            className="kbk-obsidian polished"
            style={{
              ...obsidianFrameVars('#5865F2'),
              padding: 18,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              className="kbk-obsidian polished"
              style={{
                ...obsidianFrameVars('#5865F2'),
                width: 44,
                height: 44,
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <MessageCircle size={20} color="#5865F2" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="font-heading"
                style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}
              >
                Discord
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                {t('stageDiscordSub')}
              </div>
            </div>
            <span
              style={{
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 800,
                background: 'rgba(63,207,74,0.14)',
                color: TRUST_GREEN,
                borderRadius: 999,
                border: '1px solid rgba(63,207,74,0.4)',
                letterSpacing: '0.08em',
              }}
            >
              LIVE
            </span>
          </div>
        </div>
      </section>

      {/* Latest Releases */}
      {user.artistTracks.length > 0 && (
        <section
          className="kbk-obsidian framed"
          style={{
            ...obsidianFrameVars(BOOMY_PURPLE),
            padding: 24,
            borderRadius: 16,
            marginBottom: 20,
          }}
        >
          <h2
            className="font-heading"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 18,
              fontWeight: 800,
              margin: '0 0 14px 0',
              color: '#fff',
              letterSpacing: '0.02em',
            }}
          >
            <Music2 size={18} color={BOOMY_PURPLE} /> {t('tracksHeading')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {user.artistTracks.map((track) => (
              <Link
                key={track.slug}
                href={`/tracks/${track.slug}`}
                className="boomy-track-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  color: '#fff',
                  background: 'rgba(139,92,246,0.04)',
                  transition: 'background 0.15s',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    overflow: 'hidden',
                    flexShrink: 0,
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(139,92,246,0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SafeImg
                    src={track.coverUrl || track.soundcloudArtwork}
                    alt={track.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    fallback={<Music2 size={18} color="rgba(255,255,255,0.4)" />}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: '#fff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {track.title}
                  </div>
                  {(track.genre || track.featuringMain) && (
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10.5,
                        color: 'rgba(255,255,255,0.5)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {track.genre}
                      {track.featuringMain && (
                        <>
                          {track.genre ? ' · ' : ''}
                          <span style={{ color: '#B69DFF' }}>
                            {t('featWith', {
                              name:
                                track.featuringMain.displayName ||
                                track.featuringMain.username,
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {track.trackType === 'SOUNDCLOUD' && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      color: '#FB923C',
                      background: 'rgba(251,146,60,0.12)',
                      padding: '2px 6px',
                      borderRadius: 999,
                      letterSpacing: '0.06em',
                    }}
                  >
                    SC
                  </span>
                )}
              </Link>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Link
              href="/library?artist=boomy"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: '#B69DFF',
                textDecoration: 'none',
                letterSpacing: '0.06em',
              }}
            >
              {t('seeMore')}
            </Link>
          </div>
        </section>
      )}

      {/* Connect — Socials */}
      {hasSocials && (
        <section
          className="kbk-obsidian framed"
          style={{
            ...obsidianFrameVars(BOOMY_PURPLE),
            padding: 22,
            borderRadius: 16,
            marginBottom: 20,
          }}
        >
          <h2
            className="font-heading"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 16,
              fontWeight: 800,
              margin: '0 0 12px 0',
              color: '#fff',
            }}
          >
            <ExternalLink size={16} color={BOOMY_PURPLE} /> {t('connectHeading')}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
            }}
          >
            {user.socialSoundcloud && (
              <a
                href={user.socialSoundcloud}
                target="_blank"
                rel="noopener noreferrer"
                className="kbk-obsidian polished"
                style={{
                  ...obsidianFrameVars('#FB923C'),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  color: '#fff',
                }}
              >
                <Music2 size={16} color="#FB923C" />
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  SoundCloud
                </span>
              </a>
            )}
          </div>
        </section>
      )}

      {/* Recent Wall-Posts */}
      {user.wallPosts.length > 0 && (
        <section
          className="kbk-obsidian framed"
          style={{
            ...obsidianFrameVars(BOOMY_PURPLE),
            padding: 22,
            borderRadius: 16,
          }}
        >
          <h2
            className="font-heading"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 16,
              fontWeight: 800,
              margin: '0 0 12px 0',
              color: '#fff',
            }}
          >
            <MessageCircle size={16} color={BOOMY_PURPLE} /> {t('wallHeading')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {user.wallPosts.map((post) => (
              <div
                key={post.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'rgba(139,92,246,0.06)',
                  border: '1px solid rgba(139,92,246,0.15)',
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.78)',
                    lineHeight: 1.55,
                    margin: 0,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {post.content}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: 'rgba(255,255,255,0.4)',
                    margin: '8px 0 0 0',
                    letterSpacing: '0.05em',
                  }}
                >
                  {new Date(post.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Layout-Rules — 3 Stufen (Mobile / Tablet / Desktop) */}
      <style>{`
        .boomy-hero-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          align-items: center;
          text-align: center;
        }
        .boomy-avatar-wrap {
          position: relative;
          display: flex;
          justify-content: center;
        }
        .boomy-live-dot {
          position: absolute;
          top: -6px;
          right: calc(50% - clamp(56px, 9vw, 84px) - 6px);
          width: 18px;
          height: 18px;
          display: inline-flex;
        }
        .boomy-live-dot__ping {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: #3FCF4A;
          opacity: 0.6;
          animation: kk-live-ping 1.6s cubic-bezier(0,0,0.2,1) infinite;
        }
        .boomy-live-dot__core {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 999px;
          background: #3FCF4A;
          border: 2px solid #0A0B0C;
        }
        @keyframes kk-live-ping {
          0% { transform: scale(0.6); opacity: 0.7; }
          80%, 100% { transform: scale(2.2); opacity: 0; }
        }
        .boomy-three-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        .boomy-stages-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .boomy-track-row:hover {
          background: rgba(139,92,246,0.12) !important;
        }

        /* Tablet (768-1023px) — Hero zweispaltig, 3-Card-Grid 2 Spalten + 1 unten */
        @media (min-width: 768px) {
          .boomy-hero-grid {
            grid-template-columns: auto 1fr;
            text-align: left;
            gap: 28px;
          }
          .boomy-avatar-wrap {
            justify-content: flex-start;
          }
          .boomy-live-dot {
            right: -6px;
          }
          .boomy-three-grid {
            grid-template-columns: 1fr 1fr;
          }
          .boomy-three-grid > div:nth-child(3) {
            grid-column: 1 / -1;
          }
          .boomy-stages-grid {
            grid-template-columns: 1fr 1fr;
          }
        }

        /* Desktop (>=1024px) — 3-Card-Grid voll auf 3 Spalten */
        @media (min-width: 1024px) {
          .boomy-three-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .boomy-three-grid > div:nth-child(3) {
            grid-column: auto;
          }
        }
      `}</style>
    </div>
  );
}
