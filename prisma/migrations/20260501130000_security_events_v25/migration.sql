-- v2.5 Security-Events-Audit-Log
-- Immutable-Append-Only-Tabelle fuer alle Account-Security-relevanten Events.
-- userId nullable + SET NULL on delete (Audit-Spur ueberlebt User-Loeschung).

CREATE TABLE "security_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "eventType" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "security_events_userId_createdAt_idx" ON "security_events"("userId", "createdAt");
CREATE INDEX "security_events_eventType_createdAt_idx" ON "security_events"("eventType", "createdAt");
CREATE INDEX "security_events_createdAt_idx" ON "security_events"("createdAt");
