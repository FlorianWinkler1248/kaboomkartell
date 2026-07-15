/**
 * Release-Slot Detail API Route
 *
 * GET    /api/release-slots/[id] - Einzelnen Slot laden (nur Admin)
 * PUT    /api/release-slots/[id] - Slot aktualisieren (nur Admin)
 * DELETE /api/release-slots/[id] - Slot löschen (nur Admin, nur OPEN/RESERVED ohne Track)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { updateReleaseSlotSchema } from '@/lib/validations';

// Standard-Includes für Slot-Abfragen
const slotIncludes = {
  assignee: {
    select: { id: true, username: true, displayName: true },
  },
  track: {
    select: { id: true, title: true, slug: true, status: true, genre: true, artistId: true },
  },
} as const;

/**
 * GET /api/release-slots/[id] - Einzelnen Slot mit Details laden
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const slot = await prisma.releaseSlot.findUnique({
      where: { id },
      include: slotIncludes,
    });

    if (!slot) {
      return NextResponse.json(
        { success: false, error: 'Release slot not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: slot });
  } catch (error) {
    console.error('Release-Slot Abfrage fehlgeschlagen:', error);
    return NextResponse.json(
      { success: false, error: 'Error loading release slot.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/release-slots/[id] - Slot aktualisieren
 *
 * Speziallogik:
 * - trackId gesetzt → Track.scheduledPublishAt auf scheduledDate des Slots setzen
 * - assigneeId gesetzt + Status OPEN → automatisch auf RESERVED wechseln
 * - Status APPROVED → trackId muss vorhanden sein (Validierung)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const result = updateReleaseSlotSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Aktuellen Slot laden um Status-Logik prüfen zu können
    const existingSlot = await prisma.releaseSlot.findUnique({
      where: { id },
    });

    if (!existingSlot) {
      return NextResponse.json(
        { success: false, error: 'Release slot not found.' },
        { status: 404 }
      );
    }

    const updateData = { ...result.data } as Record<string, unknown>;

    // Datum konvertieren falls vorhanden
    if (updateData.scheduledDate && typeof updateData.scheduledDate === 'string') {
      updateData.scheduledDate = new Date(updateData.scheduledDate as string);
    }

    // Wenn assigneeId gesetzt wird und Status aktuell OPEN → automatisch RESERVED
    if (updateData.assigneeId && existingSlot.status === 'OPEN' && !updateData.status) {
      updateData.status = 'RESERVED';
    }

    // Wenn Status auf APPROVED gesetzt wird → trackId muss vorhanden sein
    if (updateData.status === 'APPROVED') {
      const effectiveTrackId = updateData.trackId !== undefined ? updateData.trackId : existingSlot.trackId;
      if (!effectiveTrackId) {
        return NextResponse.json(
          { success: false, error: 'Cannot approve slot without a linked track.' },
          { status: 400 }
        );
      }
    }

    // Slot aktualisieren
    const updatedSlot = await prisma.releaseSlot.update({
      where: { id },
      data: updateData,
      include: slotIncludes,
    });

    // Wenn trackId gesetzt wurde → Track.scheduledPublishAt synchronisieren
    if (updateData.trackId && updatedSlot.track) {
      const slotDate = updateData.scheduledDate instanceof Date
        ? updateData.scheduledDate
        : existingSlot.scheduledDate;

      await prisma.track.update({
        where: { id: updatedSlot.track.id },
        data: { scheduledPublishAt: slotDate },
      });
    }

    return NextResponse.json({ success: true, data: updatedSlot });
  } catch (error) {
    console.error('Release-Slot Update fehlgeschlagen:', error);
    return NextResponse.json(
      { success: false, error: 'Error updating release slot.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/release-slots/[id] - Slot löschen
 *
 * Nur erlaubt für Slots mit Status OPEN oder RESERVED (ohne verknüpften Track).
 * Slots mit verknüpftem Track oder anderem Status können nicht gelöscht werden.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const slot = await prisma.releaseSlot.findUnique({
      where: { id },
    });

    if (!slot) {
      return NextResponse.json(
        { success: false, error: 'Release slot not found.' },
        { status: 404 }
      );
    }

    // Nur OPEN oder RESERVED Slots ohne Track dürfen gelöscht werden
    if (!['OPEN', 'RESERVED'].includes(slot.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot delete slot with status "${slot.status}". Only OPEN or RESERVED slots can be deleted.` },
        { status: 400 }
      );
    }

    if (slot.trackId) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete slot with a linked track. Remove the track first.' },
        { status: 400 }
      );
    }

    await prisma.releaseSlot.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Release slot deleted.' });
  } catch (error) {
    console.error('Release-Slot Löschung fehlgeschlagen:', error);
    return NextResponse.json(
      { success: false, error: 'Error deleting release slot.' },
      { status: 500 }
    );
  }
}
