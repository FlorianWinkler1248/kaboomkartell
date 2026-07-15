-- v2.27 Rollen-Reform Phase 1 (ADR-005)
-- Zwei neue Tabellen, KEIN User-Schema-Touch (badges/linkedAccounts sind
-- nur Relationen, keine neuen User-Felder).
--
-- ADMIN-Rolle hat implizit alle Badges (Logik in src/lib/permissions.ts —
-- kein DB-Eintrag fuer ADMIN-Bypass noetig).

-- Badge-Tabelle: Permission-Achse 2 (orthogonal zu User.role)
CREATE TABLE "badges" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "grantedBy" TEXT,
  "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scope" TEXT,
  CONSTRAINT "badges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "badges_userId_type_key" ON "badges"("userId", "type");
CREATE INDEX "badges_type_idx" ON "badges"("type");

-- LinkedAccount-Tabelle: Discord/Twitch verknuepfte Identities
CREATE TABLE "linked_accounts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerUserId" TEXT NOT NULL,
  "providerName" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "expiresAt" DATETIME,
  "linkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "linked_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "linked_accounts_provider_providerUserId_key" ON "linked_accounts"("provider", "providerUserId");
CREATE INDEX "linked_accounts_userId_idx" ON "linked_accounts"("userId");
