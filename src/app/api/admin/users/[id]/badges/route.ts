/**
 * Badge-Verwaltung (v2.27, ADR-005 Phase 1)
 *
 * POST   /api/admin/users/[id]/badges  body: { type: BadgeType }  → grant
 * DELETE /api/admin/users/[id]/badges  body: { type: BadgeType }  → revoke
 *
 * Nur ADMIN-Rolle darf vergeben/entziehen. ADMIN-User selbst haben implizit
 * alle Badges (kein Eintrag nötig). Jeder Grant/Revoke landet als
 * SecurityEvent im Audit-Log mit grantedBy=Admin-Id.
 *
 * Type-Validation via isKnownBadgeType — verhindert falsche oder Bot-injizierte
 * Badge-Strings.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';
import { isKnownBadgeType } from '@/lib/permissions';
import { logSecurityEvent } from '@/lib/security-log';

type Params = { params: Promise<{ id: string }> };

interface BadgeBody {
  type?: unknown;
}

async function readBadgeType(request: NextRequest): Promise<string | null> {
  let body: BadgeBody;
  try {
    body = (await request.json()) as BadgeBody;
  } catch {
    return null;
  }
  if (typeof body.type !== 'string') return null;
  return body.type;
}

// POST — Badge vergeben
export async function POST(request: NextRequest, { params }: Params) {
  try {
    // session wird hier gebraucht (grantedBy/revokedBy im Audit-Log)
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const type = await readBadgeType(request);
    if (!type || !isKnownBadgeType(type)) {
      return NextResponse.json(
        { success: false, error: 'Unknown badge type.' },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, role: true },
    });
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    // ADMIN hat implizit alle Badges — Eintrag ist redundant aber
    // schaden tut er nicht. Wir lassen ihn zu, damit Demote ADMIN→MITGLIED
    // die Badges nicht verliert (Audit-Klarheit über späteren Strip).

    // Idempotent: bei Double-Grant zurückgeben statt zu werfen.
    const existing = await prisma.badge.findUnique({
      where: { userId_type: { userId: id, type } },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        data: { type, alreadyGranted: true },
      });
    }

    await prisma.badge.create({
      data: {
        userId: id,
        type,
        grantedBy: session.user.id ?? null,
      },
    });

    await logSecurityEvent('badge_granted', {
      userId: id,
      request,
      metadata: { type, grantedBy: session.user.id, targetUsername: targetUser.username },
    });

    return NextResponse.json({ success: true, data: { type } });
  } catch (error) {
    return adminErrorResponse(error, 'Admin badge grant error:');
  }
}

// DELETE — Badge entziehen
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    // session wird hier gebraucht (grantedBy/revokedBy im Audit-Log)
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const type = await readBadgeType(request);
    if (!type || !isKnownBadgeType(type)) {
      return NextResponse.json(
        { success: false, error: 'Unknown badge type.' },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true },
    });
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    // Idempotent: bei Revoke ohne Eintrag = success (no-op).
    const deleted = await prisma.badge.deleteMany({
      where: { userId: id, type },
    });

    if (deleted.count > 0) {
      await logSecurityEvent('badge_revoked', {
        userId: id,
        request,
        metadata: { type, revokedBy: session.user.id, targetUsername: targetUser.username },
      });
    }

    return NextResponse.json({
      success: true,
      data: { type, revoked: deleted.count > 0 },
    });
  } catch (error) {
    return adminErrorResponse(error, 'Admin badge revoke error:');
  }
}
