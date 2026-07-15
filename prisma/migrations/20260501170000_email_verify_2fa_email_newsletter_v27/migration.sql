-- v2.7 Email-Verification + 2FA-Email-Option + Newsletter
-- Defaults für trustTier auf T0 fuer NEUE User; existing User behalten ihr T1.
-- (Default-Aenderung gilt nur fuer neue Inserts, existing Records werden nicht angefasst.)

ALTER TABLE "users" ADD COLUMN "twoFactorMethod" TEXT;
ALTER TABLE "users" ADD COLUMN "twoFactorEmailCode" TEXT;
ALTER TABLE "users" ADD COLUMN "twoFactorEmailExpiry" DATETIME;
ALTER TABLE "users" ADD COLUMN "emailVerificationToken" TEXT;
ALTER TABLE "users" ADD COLUMN "emailVerificationExpiry" DATETIME;
ALTER TABLE "users" ADD COLUMN "newsletterOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "newsletterOptInAt" DATETIME;

CREATE UNIQUE INDEX "users_emailVerificationToken_key" ON "users"("emailVerificationToken");

-- Existing User behalten T1 (waren manuell erstellt vor v2.7-Email-Verify-Einfuehrung).
-- Backfill: alle existing User bekommen emailVerified=NOW() (sie sind ja drin im System,
-- T1 wird gehalten). Default-Aenderung trustTier T1->T0 gilt nur fuer neue Inserts.
UPDATE "users" SET "emailVerified" = CURRENT_TIMESTAMP WHERE "emailVerified" IS NULL;
