/**
 * NextAuth Typ-Erweiterungen
 *
 * Fügt Rolle, User-ID, Username, tokenVersion + trustTier zur Session hinzu.
 * tokenVersion + trustTier sind v2.4-Erweiterungen (Account-Security).
 */

import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      username: string;
      image?: string | null;
      tokenVersion?: number;
      trustTier?: string;
    };
  }

  interface User {
    role?: string;
    username?: string;
    tokenVersion?: number;
    trustTier?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string;
    userId?: string;
    username?: string;
    tokenVersion?: number;
    trustTier?: string;
  }
}
