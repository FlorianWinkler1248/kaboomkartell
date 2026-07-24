/**
 * Track-Display-Helpers (v2.8 Track-Featuring)
 *
 * Zentrale Single-Source-of-Truth für Artist-Display-Strings, damit
 * "4Flow feat. Boomy" konsistent in allen ~22 Render-Stellen rauskommt.
 *
 * Schreibweise: "feat." (mit Punkt) — laut Boomy-Persona-O-Ton aus Memory
 * `project_boomy_persona_und_mission`. Nicht "ft.", nicht "feat" ohne Punkt.
 *
 * Anwendungs-Pattern:
 *   const displayName = formatArtistDisplay(track);
 *   // 4Flow                     (kein Featuring)
 *   // 4Flow feat. Boomy          (mit Featuring)
 */

interface ArtistLike {
  displayName?: string | null;
  username?: string | null;
}

interface TrackLike {
  artist?: ArtistLike | null;
  featuringArtist?: ArtistLike | null;
  /** ADR-041: externes Künstler-Profil — hat Anzeige-Priorität vor artist. */
  artistProfile?: { name?: string | null } | null;
}

/**
 * Liefert den Display-Namen für einen einzelnen Artist (displayName ODER
 * username als Fallback). Niemals leer — bei null-Werten gibt's "Unknown".
 */
function nameOf(artist: ArtistLike | null | undefined): string {
  if (!artist) return 'Unknown';
  return artist.displayName?.trim() || artist.username?.trim() || 'Unknown';
}

/**
 * "4Flow" oder "4Flow feat. Boomy" — für alle UI-Render-Stellen.
 * Akzeptiert sowohl voll-ausgeladene als auch flachere Track-Shapes.
 */
export function formatArtistDisplay(track: TrackLike): string {
  // ADR-041: Tracks externer Künstler zeigen den Profil-Namen — der
  // Account-Artist (meist Flow als Owner/Fallback) ist dann nur Verwaltung.
  const profileName = track.artistProfile?.name?.trim();
  if (profileName) return profileName;
  const main = nameOf(track.artist);
  if (track.featuringArtist) {
    return `${main} feat. ${nameOf(track.featuringArtist)}`;
  }
  return main;
}

/**
 * JSON-LD `byArtist`-Property: Array of { @type, name } wenn Featuring,
 * sonst Single-Object. Schema.org-konform.
 */
export function jsonLdArtist(track: TrackLike): unknown {
  const main = { '@type': 'MusicGroup', name: nameOf(track.artist) };
  if (track.featuringArtist) {
    return [main, { '@type': 'MusicGroup', name: nameOf(track.featuringArtist) }];
  }
  return main;
}
