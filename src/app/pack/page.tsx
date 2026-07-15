import { redirect } from 'next/navigation';

/**
 * /pack — Redirect zur eigentlichen "The Pack"-Page unter /artists.
 *
 * TopNavBar nutzt "PACK" als Label, die Page lebt aber historisch unter
 * /artists. Statt den TopNav-Link auf /artists umzubiegen, halten wir
 * beide Routen valid.
 */
export default function PackRedirect() {
  redirect('/artists');
}
