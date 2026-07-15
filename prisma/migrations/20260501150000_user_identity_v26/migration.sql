-- v2.6 User-Identity-Erweiterung
-- Neues Feld: realName (nullable, fuer Backwards-Compat mit existing Users).
-- Validation-Schema enforct die Pflicht nur beim Register (POST /api/users).

ALTER TABLE "users" ADD COLUMN "realName" TEXT;
