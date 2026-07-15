/**
 * Prisma Client Singleton (Prisma 7)
 *
 * Nutzt den better-sqlite3 Adapter. Stellt sicher, dass nur eine Instanz
 * existiert (Hot-Reload-sicher in Dev, eine Connection pro Prozess in Prod).
 *
 * SQLite-Concurrency (gegen SQLITE_BUSY → HTTP 503 bei parallelen Reads während
 * eines Writes, z.B. unter RSC-Prefetch-Wellen):
 *  - `timeout: 5000` (= better-sqlite3 busy_timeout): ein Reader wartet bis zu 5s
 *    auf einen Lock, statt sofort SQLITE_BUSY zu werfen. Direkt als Adapter-Option
 *    (BetterSQLite3InputParams erbt better-sqlite3 Options).
 *  - WAL-Journal-Modus: erlaubt parallele Reads während eines Writes. Wird per
 *    PRAGMA nach Client-Erstellung gesetzt (der Adapter bietet keine PRAGMA-Option).
 *    WAL ist PERSISTENT in der DB-Datei und erzeugt zusätzliche `-wal`/`-shm`-Files
 *    — bei Server-Reset/Backup mittragen (siehe pflicht/server-reset-db-migration).
 *
 * `timestampFormat` bleibt bewusst auf dem Adapter-Default (keine Datums-Semantik
 * ändern — wäre eine Regression auf Bestandsdaten).
 */

import { PrismaClient } from '@/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
    timeout: 5000,
  });
  const client = new PrismaClient({ adapter });
  // WAL einmalig + idempotent setzen (persistent in der DB-Datei). Fire-and-forget,
  // da der Modul-Export synchron ist; $queryRawUnsafe, weil PRAGMA journal_mode eine
  // Zeile zurückgibt. Fehler hier dürfen den Start nicht blockieren.
  void client.$queryRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Singleton auch in Production memoisieren: garantiert genau EINE
// better-sqlite3-Connection pro Prozess → weniger Lock-Contention.
globalForPrisma.prisma = prisma;

export default prisma;
