/**
 * Admin Social-Account Detail API Route (ADR-039, Workflow: prozesse/kbk-mission-board.md §D)
 *
 * PUT    /api/admin/social-accounts/[id] - Social-Account aktualisieren (nur Admin)
 * DELETE /api/admin/social-accounts/[id] - Social-Account löschen (nur Admin)
 *
 * Blaupause: /api/admin/pools/[id]. Hard-Delete ist hier ok — die Liste ist
 * reine Anzeige-Kuratierung ohne Relationen; zum Ausblenden ohne Löschen
 * gibt es den isActive-Toggle.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { updateSocialAccountSchema } from '@/lib/validations'

type Params = { params: Promise<{ id: string }> }

// PUT /api/admin/social-accounts/[id] — Account aktualisieren.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    const body = await request.json()
    const parsed = updateSocialAccountSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const account = await prisma.socialAccount.update({
      where: { id },
      data: parsed.data,
    })

    return NextResponse.json({ success: true, data: account })
  } catch (error) {
    return adminErrorResponse(error, 'Admin social account update error:')
  }
}

// DELETE /api/admin/social-accounts/[id] — Account löschen.
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const { id } = await params

    await prisma.socialAccount.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return adminErrorResponse(error, 'Admin social account delete error:')
  }
}
