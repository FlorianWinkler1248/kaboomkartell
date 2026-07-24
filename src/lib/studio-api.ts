/**
 * Studio-API-Helfer — zentraler Gate für /api/studio/* (ADR-041).
 *
 * Muster wie admin-api.ts: eine Funktion, ein Fehler-Shape. Zugang hat, wer
 * ein verknüpftes ArtistProfile besitzt UND Rolle KUENSTLER oder ADMIN trägt.
 * Alle Studio-Routen sind profilbezogen — auch ADMIN braucht ein eigenes
 * Profil (sonst 404-Hinweis), Verwaltung fremder Profile läuft über
 * /api/admin/artist-profiles.
 */

import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import type { ArtistProfile } from '@/generated/prisma/client';

type StudioGate =
  | { session: Session; profile: ArtistProfile; error: null }
  | { session: null; profile: null; error: NextResponse };

export async function requireStudio(): Promise<StudioGate> {
  const session = await auth();
  if (!session?.user) {
    return {
      session: null,
      profile: null,
      error: NextResponse.json({ success: false, error: 'Not authorized.' }, { status: 401 }),
    };
  }

  const role = session.user.role;
  if (role !== 'KUENSTLER' && role !== 'ADMIN') {
    return {
      session: null,
      profile: null,
      error: NextResponse.json(
        { success: false, error: 'Artist access required.' },
        { status: 403 }
      ),
    };
  }

  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) {
    return {
      session: null,
      profile: null,
      error: NextResponse.json(
        { success: false, error: 'No artist profile linked to this account.' },
        { status: 404 }
      ),
    };
  }

  return { session, profile, error: null };
}
