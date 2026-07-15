/**
 * Release-Slots API Route
 *
 * GET  /api/release-slots - Alle Slots in einem Zeitraum auflisten (nur Admin)
 * POST /api/release-slots - Neuen Release-Slot erstellen (nur Admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { createReleaseSlotSchema } from '@/lib/validations';

// Standard-Includes für Slot-Abfragen (Assignee + Track Details)
const slotIncludes = {
  assignee: {
    select: { id: true, username: true, displayName: true },
  },
  track: {
    select: { id: true, title: true, slug: true, status: true, genre: true, artistId: true },
  },
} as const;

/**
 * GET /api/release-slots - Slots in einem Zeitraum laden
 *
 * Query-Parameter:
 * - from (ISO-Datum, Pflicht) — Startdatum des Zeitraums
 * - to   (ISO-Datum, Pflicht) — Enddatum des Zeitraums
 */
export async function GET(request: NextRequest) {
  try {
    // Nur Admins dürfen Slots sehen
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { success: false, error: 'Query parameters "from" and "to" are required.' },
        { status: 400 }
      );
    }

    // Datumsbereich validieren
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Use ISO date strings.' },
        { status: 400 }
      );
    }

    const slots = await prisma.releaseSlot.findMany({
      where: {
        scheduledDate: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: slotIncludes,
      orderBy: { scheduledDate: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: slots,
    });
  } catch (error) {
    console.error('Release-Slot Abfrage fehlgeschlagen:', error);
    return NextResponse.json(
      { success: false, error: 'Error loading release slots.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/release-slots - Neuen Slot erstellen
 *
 * Body: { scheduledDate, assigneeId?, isBoomy?, notes? }
 * Status wird automatisch gesetzt:
 * - RESERVED wenn assigneeId oder isBoomy gesetzt
 * - OPEN sonst
 */
export async function POST(request: NextRequest) {
  try {
    // Nur Admins dürfen Slots erstellen
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = createReleaseSlotSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { scheduledDate, assigneeId, isBoomy, notes } = result.data;

    // Status automatisch bestimmen: reserviert wenn jemand zugewiesen oder Boomy-Slot
    const status = assigneeId || isBoomy ? 'RESERVED' : 'OPEN';

    const slot = await prisma.releaseSlot.create({
      data: {
        scheduledDate: new Date(scheduledDate),
        status,
        isBoomy: isBoomy || false,
        notes: notes || null,
        assigneeId: assigneeId || null,
      },
      include: slotIncludes,
    });

    return NextResponse.json(
      { success: true, message: 'Release slot created.', data: slot },
      { status: 201 }
    );
  } catch (error) {
    console.error('Release-Slot Erstellung fehlgeschlagen:', error);
    return NextResponse.json(
      { success: false, error: 'Error creating release slot.' },
      { status: 500 }
    );
  }
}
