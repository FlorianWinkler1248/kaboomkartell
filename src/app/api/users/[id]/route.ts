/**
 * User Detail API Route
 *
 * PUT /api/users/[id] - User-Rolle ändern (nur Admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
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
    const { role } = body;

    // Validierung
    const validRoles = Object.values(ROLES);
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role.' },
        { status: 400 }
      );
    }

    // User prüfen
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    // User aktualisieren
    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        displayName: true,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Role updated.',
      data: user,
    });
  } catch (error) {
    console.error('User update error:', error);
    return NextResponse.json(
      { success: false, error: 'Error updating user.' },
      { status: 500 }
    );
  }
}
