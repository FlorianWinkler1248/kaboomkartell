/**
 * Admin Stats API Route
 *
 * GET /api/admin/stats - Aggregierte Statistiken für das Dashboard
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    // Alle Queries parallel ausführen.
    // ACHTUNG: Namen und Query-Positionen müssen synchron bleiben — ein
    // Versatz hier hat früher "Users: 104" (= LOCAL-Track-Count) angezeigt.
    const [
      totalTracks,
      publishedTracks,
      draftTracks,
      archivedTracks,
      soundcloudTracks,
      localTracks,
      totalUsers,
      poolTracks,
      tracks,
      recentTracks,
    ] = await Promise.all([
      prisma.track.count(),
      prisma.track.count({ where: { isPublic: true } }),
      prisma.track.count({ where: { status: 'DRAFT' } }),
      prisma.track.count({ where: { status: 'ARCHIVED' } }),
      prisma.track.count({ where: { trackType: 'SOUNDCLOUD' } }),
      prisma.track.count({ where: { trackType: 'LOCAL' } }),
      prisma.user.count(),
      prisma.poolTrack.count(),
      // Top 5 Tracks by playCount
      prisma.track.findMany({
        orderBy: { playCount: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          playCount: true,
          trackType: true,
          artist: { select: { displayName: true, username: true } },
        },
      }),
      // Recent 5 Tracks
      prisma.track.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          trackType: true,
          createdAt: true,
          artist: { select: { displayName: true, username: true } },
        },
      }),
    ]);

    // Total plays berechnen
    const playsResult = await prisma.track.aggregate({
      _sum: { playCount: true },
    });
    const totalPlays = playsResult._sum.playCount || 0;

    // Voting-Statistiken berechnen
    const votingAggregation = await prisma.track.aggregate({
      _sum: { totalVotes: true },
      _avg: { susPercentage: true },
      where: { totalVotes: { gt: 0 } },
    });
    const votingStats = {
      totalVotes: votingAggregation._sum.totalVotes || 0,
      averageSusPercentage: Math.round(votingAggregation._avg.susPercentage || 0),
    };

    // Genre-Verteilung
    const allTracks = await prisma.track.findMany({
      select: { genre: true },
      where: { isPublic: true },
    });
    const genreCounts: Record<string, number> = {};
    for (const t of allTracks) {
      const genre = t.genre || 'Unknown';
      genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    }
    const genres = Object.entries(genreCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Role-Verteilung
    const allUsers = await prisma.user.findMany({
      select: { role: true },
    });
    const roleCounts: Record<string, number> = {};
    for (const u of allUsers) {
      roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
    }
    const roles = Object.entries(roleCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          totalTracks,
          publishedTracks,
          draftTracks,
          archivedTracks,
          totalUsers,
          totalPlays,
        },
        trackTypes: {
          local: localTracks,
          soundcloud: soundcloudTracks,
        },
        topTracks: tracks.map((t) => ({
          id: t.id,
          title: t.title,
          plays: t.playCount,
          type: t.trackType,
          artist: t.artist?.displayName || t.artist?.username || 'KBK',
        })),
        recentTracks: recentTracks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          type: t.trackType,
          createdAt: t.createdAt,
          artist: t.artist?.displayName || t.artist?.username || 'KBK',
        })),
        genres,
        roles,
        poolTracks,
        votingStats,
      },
    });
  } catch (error) {
    return adminErrorResponse(error, 'Admin stats error:');
  }
}
