import type { MetadataRoute } from 'next';
import prisma from '@/lib/db';

/**
 * Dynamische Sitemap (KBK)
 *
 * Generiert sitemap.xml mit allen oeffentlichen Seiten + published Tracks
 * + aktive Artist-Profiles (KUENSTLER + ADMIN) + aktive Playlists.
 *
 * Next.js rendert das automatisch unter /sitemap.xml.
 *
 * Ausgeschlossen (bewusst NICHT in Sitemap):
 *   /admin/*           — Admin-only, in robots.txt disallow'd
 *   /api/*             — kein Page-Content
 *   /settings, /settings/security — Auth-pflichtig, privat
 *   /community         — entfernt v0.10, existiert nicht mehr
 *   /player            — 308-Redirect auf /library
 *   /forgot-password, /reset-password/{token}, /verify-email/{token}
 *                      — Recovery-Flows, kein Crawl-Wert
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://kaboomkartell.com';
  const now = new Date();

  // Statische Pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl,                          lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${baseUrl}/schedule`,            lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${baseUrl}/library`,             lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${baseUrl}/radio`,               lastModified: now, changeFrequency: 'daily',   priority: 0.8 },
    { url: `${baseUrl}/playlists`,           lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${baseUrl}/artists`,             lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${baseUrl}/mission`,             lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${baseUrl}/about`,               lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/learn/synthesizer`,   lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/mcp`,                 lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/help`,                lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/register`,            lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/login`,               lastModified: now, changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${baseUrl}/imprint`,             lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${baseUrl}/privacy`,             lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ];

  // Dynamische Track-Pages (nur öffentliche, ARCHIVED bleibt außen vor)
  let trackPages: MetadataRoute.Sitemap = [];
  try {
    const tracks = await prisma.track.findMany({
      where: { isPublic: true },
      select: { slug: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    trackPages = tracks.map((t) => ({
      url: `${baseUrl}/tracks/${t.slug}`,
      lastModified: t.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch (err) {
    console.error('sitemap: tracks-query failed', err);
  }

  // Dynamische Profile-Pages (KUENSTLER + ADMIN, nur isActive)
  let profilePages: MetadataRoute.Sitemap = [];
  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['KUENSTLER', 'ADMIN'] },
      },
      select: { username: true, updatedAt: true },
    });
    profilePages = users.map((u) => ({
      url: `${baseUrl}/profile/${u.username}`,
      lastModified: u.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch (err) {
    console.error('sitemap: profiles-query failed', err);
  }

  // Dynamische Playlist-Pages (active)
  let playlistPages: MetadataRoute.Sitemap = [];
  try {
    const playlists = await prisma.playlist.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    });
    playlistPages = playlists.map((p) => ({
      url: `${baseUrl}/playlists/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.error('sitemap: playlists-query failed', err);
  }

  return [...staticPages, ...trackPages, ...profilePages, ...playlistPages];
}
