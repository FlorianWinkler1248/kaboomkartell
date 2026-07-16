-- Mission-Board + Artist-Funnel (ADR-039, 16.07.2026)
-- Rein additiv: 4 neue Tabellen (missions, mission_acceptances,
-- social_accounts, artist_applications), keine Bestands-Tabelle beruehrt.
-- Prod-Ablauf laut docs/DEPLOYMENT.md: Service-Stop -> DB-Backup inkl. WAL
-- -> prisma migrate deploy -> Start. Rollback: Tabellen ignorieren/droppen.

-- CreateTable
CREATE TABLE "missions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "progressCurrent" REAL,
    "progressTarget" REAL,
    "progressUnit" TEXT,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "acceptable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT 'flow',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "mission_acceptances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mission_acceptances_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mission_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ownerLabel" TEXT NOT NULL DEFAULT 'kbk',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "artist_applications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "links" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "mailSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "artist_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "missions_slug_key" ON "missions"("slug");

-- CreateIndex
CREATE INDEX "missions_status_sortOrder_idx" ON "missions"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "mission_acceptances_userId_idx" ON "mission_acceptances"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mission_acceptances_missionId_userId_key" ON "mission_acceptances"("missionId", "userId");

-- CreateIndex
CREATE INDEX "social_accounts_isActive_sortOrder_idx" ON "social_accounts"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "artist_applications_userId_key" ON "artist_applications"("userId");

-- CreateIndex
CREATE INDEX "artist_applications_status_idx" ON "artist_applications"("status");

