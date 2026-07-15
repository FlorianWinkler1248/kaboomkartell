import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

/**
 * Profil-API
 *
 * GET  /api/profile — Eigenes Profil laden (authentifiziert)
 * PUT  /api/profile — Eigenes Profil aktualisieren (authentifiziert)
 */

// Erlaubte Felder für Update
const ALLOWED_FIELDS = ['displayName', 'bio', 'socialSoundcloud', 'socialInstagram', 'socialTelegram', 'socialWebsite'] as const;
const MAX_BIO_LENGTH = 300;
const MAX_FIELD_LENGTH = 200;

// v2.30: Twitch-Channel-Login — 4-25 Buchstaben/Zahlen/Underscore (Twitch-Doku).
// Leerstring -> null (= Channel entfernen).
const TWITCH_CHANNEL_REGEX = /^[a-zA-Z0-9_]{4,25}$/;

// === GET: Eigenes Profil laden ===
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated.' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        role: true,
        socialSoundcloud: true,
        socialInstagram: true,
        socialTelegram: true,
        socialWebsite: true,
        twitchChannel: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('Profile GET Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load profile.' },
      { status: 500 }
    );
  }
}

// === PUT: Profil aktualisieren ===
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated.' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Nur erlaubte Felder extrahieren und validieren
    const updateData: Record<string, string | boolean | Date | null> = {};

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        const value = body[field];

        // Null oder leerer String -> null
        if (value === null || value === '' || value === undefined) {
          updateData[field] = null;
          continue;
        }

        if (typeof value !== 'string') continue;

        const trimmed = value.trim();
        const maxLen = field === 'bio' ? MAX_BIO_LENGTH : MAX_FIELD_LENGTH;

        if (trimmed.length > maxLen) {
          return NextResponse.json(
            { success: false, error: `${field} must be ${maxLen} characters or less.` },
            { status: 400 }
          );
        }

        updateData[field] = trimmed || null;
      }
    }

    // v2.30: twitchChannel — eigene Validation (Regex statt freier Text).
    if ('twitchChannel' in body) {
      const raw = body.twitchChannel;
      if (raw === null || raw === '' || raw === undefined) {
        updateData.twitchChannel = null;
      } else if (typeof raw === 'string') {
        const trimmed = raw.trim().toLowerCase();
        if (!TWITCH_CHANNEL_REGEX.test(trimmed)) {
          return NextResponse.json(
            { success: false, error: 'Twitch channel must be 4–25 letters/digits/underscores.' },
            { status: 400 }
          );
        }
        updateData.twitchChannel = trimmed;
      }
    }

    // Newsletter-Opt-In separat (Boolean, v2.7).
    // Nur akzeptiert wenn explizit als Boolean uebermittelt.
    if (typeof body.newsletterOptIn === 'boolean') {
      updateData.newsletterOptIn = body.newsletterOptIn;
      // newsletterOptInAt setzen wenn neu aktiviert
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { newsletterOptIn: true },
      });
      if (body.newsletterOptIn && !currentUser?.newsletterOptIn) {
        updateData.newsletterOptInAt = new Date();
      }
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        role: true,
        socialSoundcloud: true,
        socialInstagram: true,
        socialTelegram: true,
        socialWebsite: true,
        twitchChannel: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('Profile PUT Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update profile.' },
      { status: 500 }
    );
  }
}
