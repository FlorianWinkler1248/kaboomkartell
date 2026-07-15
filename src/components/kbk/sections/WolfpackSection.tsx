/**
 * WolfpackSection — Pack der Flow-ernannten Mitglieder.
 *
 * Server Component. Zeigt nur User mit Rolle ADMIN, HELFER oder KUENSTLER
 * (keine Self-Register-MITGLIEDs). Statt Track-Counts: Genre-Tags der
 * Mitglieder, abgeleitet aus den Pools, in denen ihre Tracks liegen.
 *
 * Sortierung: Role-Rang (ADMIN > HELFER > KUENSTLER), dann createdAt asc.
 */

import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { obsidianFrameVars } from '@/lib/obsidian-frame';

const GREEN = '#3FCF4A';
const RED = '#E63B2E';
const YELLOW = '#F5D02E';
const ACCENT_ROTATION = [GREEN, YELLOW, RED] as const;

const GENRE_COLOR: Record<string, string> = {
  Phonk: RED,
  Hardtek: YELLOW,
  Raggatek: GREEN,
};

// labelKey zeigt auf einen Sub-Key in home.wolfpack — die eigentliche
// Übersetzung passiert im Component (Server-Translate).
type RoleInfo = { labelKey: 'roleCartelChief' | 'roleArtist' | 'roleMod' | 'roleWolf'; color: string };

function mapRole(role: string): RoleInfo {
  switch (role) {
    case 'ADMIN':
      return { labelKey: 'roleCartelChief', color: YELLOW };
    case 'KUENSTLER':
      return { labelKey: 'roleArtist', color: GREEN };
    case 'HELFER':
      return { labelKey: 'roleMod', color: YELLOW };
    default:
      return { labelKey: 'roleWolf', color: RED };
  }
}

function roleRank(role: string): number {
  switch (role) {
    case 'ADMIN':
      return 3;
    case 'HELFER':
      return 2;
    case 'KUENSTLER':
      return 1;
    default:
      return 0;
  }
}

export default async function WolfpackSection() {
  const t = await getTranslations('home.wolfpack');

  let cards: Array<{
    name: string;
    roleLabel: string;
    roleColor: string;
    genres: string[];
    color: string;
  }> = [];

  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['ADMIN', 'HELFER', 'KUENSTLER'] },
      },
      select: {
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
        artistTracks: {
          where: { isPublic: true },
          select: {
            poolTracks: {
              select: { pool: { select: { genre: true } } },
            },
          },
        },
      },
    });

    users.sort((a, b) => {
      const roleDiff = roleRank(b.role) - roleRank(a.role);
      if (roleDiff !== 0) return roleDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    cards = users.map((u, i) => {
      const genreSet = new Set<string>();
      for (const t of u.artistTracks) {
        for (const pt of t.poolTracks) {
          if (pt.pool?.genre) genreSet.add(pt.pool.genre);
        }
      }
      const role = mapRole(u.role);
      return {
        name: u.displayName ?? u.username,
        roleLabel: t(role.labelKey),
        roleColor: role.color,
        genres: Array.from(genreSet).sort(),
        color: ACCENT_ROTATION[i % ACCENT_ROTATION.length],
      };
    });
  } catch (err) {
    console.error('WolfpackSection query failed:', err);
    cards = [];
  }

  return (
    <div className="kbk-page-section" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 16 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: GREEN,
            letterSpacing: '0.2em',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          /02/ WOLFPACK
        </span>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${GREEN}40, transparent)` }} />
      </div>
      {cards.length === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.1em',
          }}
        >
          {t('packEmpty')}
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 10,
          }}
        >
          {cards.map((u, i) => (
            <div
              key={`${u.name}-${i}`}
              className="kbk-obsidian framed"
              style={{
                ...obsidianFrameVars(u.color),
                padding: 14,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  background: `${u.color}20`,
                  border: `1px solid ${u.color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: u.color,
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                {u.name[0]?.toUpperCase() ?? '?'}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: '#fff',
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {u.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: u.roleColor,
                    letterSpacing: '0.15em',
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {u.roleLabel}
                </div>
                {u.genres.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {u.genres.map((g) => {
                      const c = GENRE_COLOR[g] ?? '#fff';
                      return (
                        <span
                          key={g}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 8,
                            color: c,
                            border: `1px solid ${c}60`,
                            padding: '2px 6px',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {g}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
