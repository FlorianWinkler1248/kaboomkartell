/**
 * Site Settings API Route
 *
 * GET /api/settings - Aktuelle Settings abrufen (öffentlich)
 * PUT /api/settings - Settings aktualisieren (nur Admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { updateSettingsSchema } from '@/lib/validations';

/**
 * GET /api/settings - Settings laden
 */
export async function GET() {
  try {
    let settings = await prisma.siteSettings.findUnique({
      where: { id: 'singleton' },
    });

    // Falls noch keine Settings existieren, erstellen
    if (!settings) {
      settings = await prisma.siteSettings.create({
        data: { id: 'singleton' },
      });
    }

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Settings loading error:', error);
    return NextResponse.json(
      { success: false, error: 'Error loading settings.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings - Settings aktualisieren
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = updateSettingsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const settings = await prisma.siteSettings.upsert({
      where: { id: 'singleton' },
      update: result.data,
      create: {
        id: 'singleton',
        ...result.data,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Settings updated.',
      data: settings,
    });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json(
      { success: false, error: 'Error updating settings.' },
      { status: 500 }
    );
  }
}
