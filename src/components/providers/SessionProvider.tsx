'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

/**
 * Session-Provider Wrapper für Client-Komponenten.
 * Wickelt die gesamte App ein, damit useSession() überall funktioniert.
 */

export default function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
