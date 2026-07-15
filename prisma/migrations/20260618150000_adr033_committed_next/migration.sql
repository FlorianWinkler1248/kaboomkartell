-- ADR-033: Crowd-Control-Voting fuers ÜBERNÄCHSTE Lied (N+2, Track-Lead-Puffer).
-- Zwei additive nullable Spalten auf radio_heads — kein Datenverlust, kein Backfill noetig.
--
-- committedNextTrackId: der bereits feststehende N+1 (UP NEXT) ab Track-Start.
--   null = Bestands-Head vor ADR-033 → advanceFrom heilt selbst (resolveWinner-Recovery).
-- committedSource: Herkunft des committeten N+1 (VOTE|RANDOM|SEED) → wird beim Advance
--   zu RadioPlay.source des dann gespielten N+1.

ALTER TABLE "radio_heads" ADD COLUMN "committedNextTrackId" TEXT;
ALTER TABLE "radio_heads" ADD COLUMN "committedSource" TEXT;
