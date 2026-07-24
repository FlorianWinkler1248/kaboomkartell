/**
 * Admin: Review-Queue der Studio-Einreichungen (ADR-041)
 *
 * GET /api/admin/submissions?status=PENDING — Liste inkl. Track + Einreicher.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api';
import { SUBMISSION_STATUS } from '@/lib/submission';

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const validStatuses = Object.values(SUBMISSION_STATUS) as string[];
    const status =
      statusParam && validStatuses.includes(statusParam) ? statusParam : null;

    const submissions = await prisma.uploadSubmission.findMany({
      where: status ? { status } : {},
      include: {
        track: {
          include: {
            artistProfile: { select: { id: true, slug: true, name: true } },
          },
        },
        submitter: { select: { id: true, username: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: submissions });
  } catch (err) {
    return adminErrorResponse(err, 'Admin submissions GET error:');
  }
}
