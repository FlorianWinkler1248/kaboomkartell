import { redirect } from 'next/navigation'

/**
 * /player → Redirect nach /library
 *
 * Die alte Player-Seite ist obsolet (Radio-Modus ersetzt Einzeltrack-Wiedergabe).
 * Redirect bewahrt bestehende Bookmarks und SEO-Links.
 */

export default function PlayerPage() {
  redirect('/library')
}
