-- Account-Security v2.4 — alle 4 Blocks gebuendelt
-- A) Login-Hardening: failedLoginAttempts + lockedUntil
-- B) Session-Management: tokenVersion
-- C) 2FA + Trust-Tier: twoFactorEnabled, twoFactorSecret, twoFactorBackupCodes, emailVerified, trustTier
-- D) Password-Reset: resetToken (unique), resetTokenExpiry

ALTER TABLE "users" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lockedUntil" DATETIME;
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "trustTier" TEXT NOT NULL DEFAULT 'T1';
ALTER TABLE "users" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "users" ADD COLUMN "twoFactorBackupCodes" TEXT;
ALTER TABLE "users" ADD COLUMN "emailVerified" DATETIME;
ALTER TABLE "users" ADD COLUMN "resetToken" TEXT;
ALTER TABLE "users" ADD COLUMN "resetTokenExpiry" DATETIME;

CREATE UNIQUE INDEX "users_resetToken_key" ON "users"("resetToken");
