import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { showVanity } from '@/lib/vanity';

/**
 * GET /api/kbk/stats
 *
 * Liefert die Live-Stats für das Hero + TopNav-Ticker.
 * Public, no auth (non-sensitive aggregate numbers).
 *
 * Response:
 *  {
 *    wolvesOnline: number,     // Aktive User
 *    tracksSpun:   number,     // Sum of playCount
 *    avgBpm:       number,     // Avg bpm der Tracks
 *    totalTracks:  number,     // PUBLISHED Track-Count
 *    artistCount:  number,     // Users role=KUENSTLER
 *    aura24h:      number,     // Community-Votes (Crowd Control) in den letzten 24h
 *    uptimeLabel:  string,     // "420d" / "∞:∞:∞" / etc.
 *  }
 */

// Force dynamic — sonst friert Next.js die Stats beim Build auf 0/0/0 ein
// (Prisma-DB ist im Build-Container nicht erreichbar) und cached das für
// 30s. Live-Daten sollen direkt aus der DB kommen.
export const dynamic = 'force-dynamic';

const LAUNCH_DATE = new Date('2026-04-16T00:00:00Z'); // KBK Live seit 16.04.2026

function uptimeLabel(): string {
  const ms = Date.now() - LAUNCH_DATE.getTime();
  if (ms <= 0) return '∞:∞:∞';
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return '<1d';
  return `${days}d`;
}

export async function GET() {
  try {
    const [
      wolvesOnline,
      playsAgg,
      bpmAgg,
      totalTracks,
      artistCount,
      aura24hCount,
    ] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.track.aggregate({
        _sum: { playCount: true },
        where: { isPublic: true },
      }),
      prisma.track.aggregate({
        _avg: { bpm: true },
        where: { isPublic: true, bpm: { not: null } },
      }),
      prisma.track.count({ where: { isPublic: true } }),
      prisma.user.count({ where: { role: 'KUENSTLER', isActive: true } }),
      // Umgewidmet (19.06.2026): zählt jetzt die Crowd-Control-Voting-Aktivität
      // (RadioVote) der letzten 24h — das Track-Request-Feature wurde entfernt.
      prisma.radioVote.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
        },
      }),
    ]);

    return NextResponse.json({
      // Vanity-Gate: leere/kleine Community-Zahlen werden ausgeblendet (null),
      // bis echter Traffic da ist — dann erscheinen sie automatisch (siehe lib/vanity).
      wolvesOnline: showVanity(wolvesOnline, 'wolvesOnline') ? wolvesOnline : null,
      tracksSpun: playsAgg._sum.playCount ?? 0,
      avgBpm: Math.round(bpmAgg._avg.bpm ?? 0),
      totalTracks,
      artistCount,
      aura24h: showVanity(aura24hCount, 'aura24h') ? aura24hCount : null,
      uptimeLabel: uptimeLabel(),
    });
  } catch (err) {
    console.error('KBK stats error:', err);
    return NextResponse.json(
      {
        wolvesOnline: null,
        tracksSpun: 0,
        avgBpm: 0,
        totalTracks: 0,
        artistCount: 0,
        aura24h: null,
        uptimeLabel: '—',
      },
      { status: 200 } // Falls DB down — trotzdem leere Antwort damit Frontend nicht kippt
    );
  }
}
