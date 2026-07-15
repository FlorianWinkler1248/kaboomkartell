/**
 * Timetable Lücken-Analyse API Route
 *
 * GET /api/admin/timetable/gaps - Findet unbedeckte Zeitfenster im Wochenplan (Admin)
 */

import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAdmin, adminErrorResponse } from '@/lib/admin-api'
import { findGaps, type TimetableGap } from '@/lib/radio'

// GET /api/admin/timetable/gaps — Lücken im Sendeplan finden
export async function GET() {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const slots = await prisma.timetableSlot.findMany({
      where: { isActive: true },
    })

    // Slots in das Radio-Engine-Format konvertieren
    const radioSlots = slots.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startHour: s.startHour,
      startMin: s.startMin,
      endHour: s.endHour,
      endMin: s.endMin,
      label: s.label,
      priority: s.priority,
      poolId: s.poolId,
    }))

    const gaps = findGaps(radioSlots)

    // Severity basierend auf zeitlicher Nähe setzen
    const now = new Date()
    const currentDay = now.getDay()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    const gapsWithSeverity: TimetableGap[] = gaps.map((gap) => {
      // Wie weit ist die Lücke von jetzt entfernt (in Tagen)?
      let daysAway = gap.dayOfWeek - currentDay
      if (daysAway < 0) daysAway += 7
      if (daysAway === 0 && gap.startMinutes < currentMinutes) daysAway = 7

      // Innerhalb 24h = kritisch, sonst Warnung
      const hoursAway = daysAway * 24 + (gap.startMinutes - currentMinutes) / 60
      return {
        ...gap,
        severity: hoursAway <= 24 ? 'critical' as const : 'warning' as const,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        gaps: gapsWithSeverity,
        totalGapMinutes: gaps.reduce((sum, g) => sum + (g.endMinutes - g.startMinutes), 0),
        isFullyCovered: gaps.length === 0,
      },
    })
  } catch (error) {
    return adminErrorResponse(error, 'Admin timetable gaps error:')
  }
}
