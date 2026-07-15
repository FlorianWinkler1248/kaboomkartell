-- 08.06.2026 (ADR-028): Wiederkehrende Live-Events (z.B. Freitags-Twitch-Stream).
-- Rein additiv (wie die v2.34-Migration): eine nullable Spalte, KEIN Touch an
-- Bestandsdaten. null = einmaliges Event (bisheriges Verhalten), 0-6 = jede Woche
-- an diesem Wochentag (0=So..6=Sa), nur die Uhrzeit aus startTime/endTime gilt.
-- Engine: lib/radio.ts (isEventActive/findCurrentSlot/getUpcoming).
ALTER TABLE "timetable_events" ADD COLUMN "recurringDayOfWeek" INTEGER;
