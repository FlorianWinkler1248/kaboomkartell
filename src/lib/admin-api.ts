/**
 * Admin-API-Helfer — zentraler ADMIN-Gate + Prisma-Fehler-Mapping.
 *
 * Vorher war der Rollen-Check in jede /api/admin-Route kopiert (mit
 * gemischten DE/EN-Fehlertexten), und jede Mutation verschluckte
 * Prisma-Fehler als generisches 500. Dieser Helfer vereinheitlicht beides:
 *
 *   - requireAdmin(): einheitlicher 403-Gate, EN-Fehlertext
 *   - adminErrorResponse(): P2002 (Unique-Konflikt) → 409,
 *     P2025 (Datensatz fehlt) → 404, alles andere → 500 mit Server-Log
 *
 * Damit kann die Admin-UI dem User per Toast sagen, WAS schiefging,
 * statt pauschal "Internal error" zu zeigen.
 */

import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';
import { Prisma } from '@/generated/prisma/client';

type AdminGate =
  | { session: Session; error: null }
  | { session: null; error: NextResponse };

/** ADMIN-Gate für API-Routen. Nutzung:
 *  const { session, error } = await requireAdmin();
 *  if (error) return error;
 */
export async function requireAdmin(): Promise<AdminGate> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return {
      session: null,
      error: NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      ),
    };
  }
  return { session, error: null };
}

/** Fehler-Mapping für Admin-Mutationen — im catch-Block aufrufen. */
export function adminErrorResponse(error: unknown, logLabel: string): NextResponse {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Not found — the record no longer exists.' },
        { status: 404 }
      );
    }
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Conflict — an entry with this value already exists.' },
        { status: 409 }
      );
    }
  }
  console.error(logLabel, error);
  return NextResponse.json(
    { success: false, error: 'Internal error.' },
    { status: 500 }
  );
}
