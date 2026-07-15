/**
 * NextAuth.js Shared Config (Edge-kompatibel)
 *
 * Enthält die Auth-Konfiguration OHNE Datenbank-Imports.
 * Wird von der Middleware (Edge Runtime) und auth.ts (Node Runtime) genutzt.
 *
 * Warum getrennt?
 * - Middleware läuft im Edge Runtime (kein native SQLite möglich)
 * - Die authorize()-Funktion mit DB-Zugriff bleibt in auth.ts
 * - Hier nur: Pages, Session-Strategie, Callbacks
 */

import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  // Custom Seiten
  pages: {
    signIn: '/login',
    newUser: '/register',
  },

  // JWT-Strategie (kein Session-Store nötig).
  // Lifetime von 30 auf 7 Tage gesenkt (v2.4): kuerzere Lifetime begrenzt
  // den Schaden bei kompromittierten Tokens; die meisten User sind eh aktiv.
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 Tage
    updateAge: 24 * 60 * 60,   // Token wird 1x/Tag bei Aktivität refreshed
  },

  callbacks: {
    // Rolle und User-ID in den JWT-Token schreiben.
    // tokenVersion und trustTier werden mitgenommen für Block B + C.
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.userId = user.id;
        token.username = (user as { username: string }).username;
        token.tokenVersion = (user as { tokenVersion?: number }).tokenVersion ?? 0;
        token.trustTier = (user as { trustTier?: string }).trustTier ?? 'T1';
      }
      return token;
    },

    // Rolle und User-ID in die Session injizieren
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as string;
        session.user.username = token.username as string;
        session.user.tokenVersion = (token.tokenVersion as number) ?? 0;
        session.user.trustTier = (token.trustTier as string) ?? 'T1';
      }
      return session;
    },

    // Authorized-Callback für Middleware (Edge-kompatibel)
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const userRole = auth?.user?.role;
      const pathname = nextUrl.pathname;

      // Admin-Routen: Nur eingeloggte Admins
      if (pathname.startsWith('/admin')) {
        if (!isLoggedIn) return false; // -> Redirect zu signIn page
        if (userRole !== 'ADMIN') {
          return Response.redirect(new URL('/', nextUrl.origin));
        }
      }

      return true;
    },
  },

  // Providers werden in auth.ts hinzugefügt
  providers: [],

  // Secret für JWT-Verschlüsselung
  secret: process.env.NEXTAUTH_SECRET,
};
