/**
 * SoundCloud oEmbed Helper
 *
 * Holt Metadaten von der SoundCloud oEmbed API (kein API-Key nötig).
 * Liefert Titel, Thumbnail, Embed-HTML und Künstlername.
 */

interface SoundcloudOEmbedResponse {
  title: string;
  description: string;
  thumbnail_url: string;
  author_name: string;
  author_url: string;
  html: string;
}

export interface SoundcloudMetadata {
  title: string;
  description: string;
  artworkUrl: string;
  artistName: string;
  artistUrl: string;
  embedUrl: string;
}

/**
 * Fetches metadata from SoundCloud's oEmbed API.
 * Throws on network errors or invalid URLs.
 */
export async function fetchSoundcloudMetadata(trackUrl: string): Promise<SoundcloudMetadata> {
  const oEmbedUrl = `https://soundcloud.com/oembed?url=${encodeURIComponent(trackUrl)}&format=json`;

  const res = await fetch(oEmbedUrl);
  if (!res.ok) {
    throw new Error(`SoundCloud oEmbed Fehler: ${res.status} ${res.statusText}`);
  }

  const data: SoundcloudOEmbedResponse = await res.json();

  // Extract iframe src URL from HTML string
  const srcMatch = data.html.match(/src="([^"]+)"/);
  if (!srcMatch) {
    throw new Error('Konnte Embed-URL nicht aus SoundCloud-Antwort extrahieren.');
  }

  return {
    title: data.title,
    description: data.description || '',
    artworkUrl: data.thumbnail_url || '',
    artistName: data.author_name,
    artistUrl: data.author_url,
    embedUrl: srcMatch[1],
  };
}
