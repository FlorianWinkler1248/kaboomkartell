/**
 * Admin Social-Accounts API Route (ADR-039, Workflow: prozesse/kbk-mission-board.md §D)
 *
 * GET  /api/admin/social-accounts - Alle Social-Accounts, auch inaktive (nur Admin)
 * POST /api/admin/social-accounts - Neuen Social-Account anlegen (nur Admin)
 *
 * Admin-gepflegte "Follow the pack"-Liste — erweiterbar um künftige
 * Künstler-Accounts (ownerLabel = Artist-Handle, kbk-artist-onboarding §C15).
 * Public liest nur isActive=true; der Admin sieht ALLES.
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { createSocialAccountSchema } from '@/lib/validations'

// GET /api/admin/social-accounts — komplette Liste inkl. isActive=false.
export async function GET() {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const accounts = await prisma.socialAccount.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json({ success: true, data: accounts })
  } catch (error) {
    return adminErrorResponse(error, 'Admin social accounts list error:')
  }
}

// POST /api/admin/social-accounts — Neuen Account anlegen.
export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const body = await request.json()
    const parsed = createSocialAccountSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const account = await prisma.socialAccount.create({ data: parsed.data })

    return NextResponse.json({ success: true, data: account }, { status: 201 })
  } catch (error) {
    return adminErrorResponse(error, 'Admin social account create error:')
  }
}
