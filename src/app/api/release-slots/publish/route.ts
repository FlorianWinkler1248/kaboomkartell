/**
 * Release-Slots Publish API (Cron-Endpunkt)
 *
 * POST /api/release-slots/publish - Fällige Slots veröffentlichen
 *
 * Wird per Cron-Job aufgerufen und:
 * 1. Veröffentlicht alle APPROVED Slots deren scheduledDate erreicht ist
 * 2. Bei Boomy-Slots ohne Track: zieht zufälligen wartenden Boomy-Track
 * 3. Erstellt WallPosts für jede Veröffentlichung
 * 4. Setzt abgelaufene OPEN/RESERVED Slots auf EXPIRED
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { RELEASE_CONFIG, BOOMY_CONFIG } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    // Secret-Key Authentifizierung prüfen
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || authHeader !== RELEASE_CONFIG.autoPublishSecret) {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const now = new Date();
    const published: Array<{ id: string; title: string; artist: string }> = [];

    // Alle fälligen APPROVED Slots laden
    const approvedSlots = await prisma.releaseSlot.findMany({
      where: {
        status: 'APPROVED',
        scheduledDate: { lte: now },
      },
      include: {
        track: {
          include: {
            artist: { select: { id: true, username: true, displayName: true } },
          },
        },
      },
    });

    for (const slot of approvedSlots) {
      try {
        let trackToPublish = slot.track;

        // Boomy-Slot ohne verknüpften Track → zufälligen wartenden Boomy-Track ziehen
        if (slot.isBoomy && !trackToPublish) {
          const poolTracks = await prisma.track.findMany({
            where: {
              isPublic: false,
              status: { not: 'ARCHIVED' },
              artist: { username: BOOMY_CONFIG.username },
            },
            include: {
              artist: { select: { id: true, username: true, displayName: true } },
            },
          });

          if (poolTracks.length > 0) {
            // Zufälligen Track aus dem Pool wählen und mit Slot verknüpfen
            trackToPublish = poolTracks[Math.floor(Math.random() * poolTracks.length)];
            await prisma.releaseSlot.update({
              where: { id: slot.id },
              data: { trackId: trackToPublish.id },
            });
          }
        }

        // Track veröffentlichen (wenn vorhanden)
        if (trackToPublish) {
          await prisma.track.update({
            where: { id: trackToPublish.id },
            data: {
              isPublic: true,
              publishedAt: now,
            },
          });

          // Slot als veröffentlicht markieren
          await prisma.releaseSlot.update({
            where: { id: slot.id },
            data: { status: 'PUBLISHED' },
          });

          // WallPost erstellen (Ankündigung der Veröffentlichung)
          const artistName = trackToPublish.artist.displayName || trackToPublish.artist.username;
          try {
            await prisma.wallPost.create({
              data: {
                content: `\u{1F3B5} New release: ${trackToPublish.title} by ${artistName}!`,
                type: 'SHOUTOUT',
                authorId: trackToPublish.artist.id,
              },
            });
          } catch (wallPostError) {
            // WallPost-Fehler ist nicht kritisch, Track wurde trotzdem veröffentlicht
            console.error('Fehler beim Erstellen des Release-WallPosts:', wallPostError);
          }

          published.push({
            id: trackToPublish.id,
            title: trackToPublish.title,
            artist: artistName,
          });
        }
      } catch (slotError) {
        // Einzelner Slot-Fehler soll nicht den ganzen Cron-Job abbrechen
        console.error(`Fehler beim Veröffentlichen von Slot ${slot.id}:`, slotError);
      }
    }

    // Abgelaufene Slots markieren: OPEN/RESERVED mit scheduledDate > 24h in der Vergangenheit
    const expiryThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const expireResult = await prisma.releaseSlot.updateMany({
      where: {
        status: { in: ['OPEN', 'RESERVED'] },
        scheduledDate: { lt: expiryThreshold },
      },
      data: { status: 'EXPIRED' },
    });

    return NextResponse.json({
      success: true,
      data: {
        published,
        expired: expireResult.count,
      },
    });
  } catch (error) {
    console.error('Release auto-publish Fehler:', error);
    return NextResponse.json(
      { success: false, error: 'Error publishing release slots.' },
      { status: 500 }
    );
  }
}
