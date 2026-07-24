/**
 * Next.js Middleware (Edge Runtime)
 *
 * Schuetzt Admin-Routen vor nicht-autorisierten Zugriffen.
 * Nutzt auth.config.ts (ohne DB-Imports) für Edge-Kompatibilität.
 *
 * Die authorized()-Callback in auth.config.ts handhabt die Logik:
 * - /admin/* -> Nur eingeloggte Admins
 * - Alles andere -> Durchlassen
 */

import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  // Matcher: Nur auf relevanten Pfaden laufen (Performance).
  // /studio (ADR-041): Artist-Studio — Rolle KUENSTLER/ADMIN, Edge-safe im JWT.
  matcher: ['/admin/:path*', '/studio/:path*'],
};
