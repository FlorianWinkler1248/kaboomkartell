-- Mission-i18n (16.07.2026): Missions-Inhalte mehrsprachig.
-- Rein additiv: eine nullable Spalte "translations" auf missions —
-- JSON-String { "de"?: {title?,summary?,body?,actionLabel?}, "es"?, "fr"? }
-- (Konvention wie artist_applications.links). EN bleibt in den Basisfeldern,
-- null = keine Uebersetzungen (Fallback EN). Kein Backfill noetig.
-- Prod-Ablauf laut docs/DEPLOYMENT.md: Service-Stop -> DB-Backup inkl. WAL
-- -> prisma migrate deploy -> Start. Rollback: Spalte ignorieren/droppen.

-- AlterTable
ALTER TABLE "missions" ADD COLUMN "translations" TEXT;
