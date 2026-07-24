import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import MyPlaylistClient from './MyPlaylistClient';

/**
 * My Playlist (ADR-041) — statische Route gewinnt gegen /playlists/[slug].
 *
 * Server-Shell nur für Metadata; der Inhalt ist komplett client-seitig
 * (Session-Likes aus localStorage bzw. Aura+-Votes via /api/me/playlist).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('myPlaylist');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default function MyPlaylistPage() {
  return <MyPlaylistClient />;
}
