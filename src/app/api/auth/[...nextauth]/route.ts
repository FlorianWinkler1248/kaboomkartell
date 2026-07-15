/**
 * NextAuth API Route Handler
 *
 * Handhabt alle Auth-Requests (Login, Logout, Session).
 */

import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
