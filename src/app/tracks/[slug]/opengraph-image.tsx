/**
 * OG-Share-Card für Track-Seiten (P2.7 / ADR-035).
 *
 * Rendert ein gebrandetes 1200×630-Bild via next/og — kein neues Package. Geteilte
 * `?ref=mcp`-Links (aus den MCP-Deep-Links) sehen damit in Discord/Slack/iMessage nach
 * etwas aus statt nach nacktem Text.
 */

import { ImageResponse } from 'next/og';
import prisma from '@/lib/db';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'KaboomKartell track';

const ACCENT = '#3FCF4A';

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const track = await prisma.track.findUnique({
    where: { slug },
    select: {
      title: true,
      artist: { select: { username: true, displayName: true } },
      featuringArtist: { select: { username: true, displayName: true } },
    },
  });

  const title = track?.title ?? 'KaboomKartell';
  const main = track?.artist?.displayName || track?.artist?.username || '4Flow';
  const feat = track?.featuringArtist?.displayName || track?.featuringArtist?.username;
  const artist = feat ? `${main} feat. ${feat}` : main;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0A0B0C',
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ color: ACCENT, fontSize: 34, fontWeight: 900, letterSpacing: 8 }}>
          KABOOMKARTELL
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: '#fff', fontSize: 92, fontWeight: 900, lineHeight: 1.02 }}>{title}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 46, marginTop: 18 }}>{artist}</div>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 26 }}>
          make noise together · phonk · hardtek
        </div>
      </div>
    ),
    { ...size },
  );
}
