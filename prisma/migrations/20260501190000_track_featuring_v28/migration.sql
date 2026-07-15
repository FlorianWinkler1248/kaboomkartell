-- v2.8 Track-Featuring + Hardphonk-Backfill + MiniFlow-Test-User-Cleanup

-- ===========================================================================
-- 1) Schema: Track.featuringArtistId (nullable, SetNull-on-User-Delete)
-- ===========================================================================
ALTER TABLE "tracks" ADD COLUMN "featuringArtistId" TEXT;

-- ===========================================================================
-- 2) Backfill: Hardphonk-Pool-Tracks bekommen Boomy als Featuring-Artist +
--    AI-Disclosure auf 'ai_assisted' / aiSource='boomy' (konsistent mit
--    Boomy-Persona O-Ton: "Hybrid-Tracks als 4Flow feat. Boomy").
-- ===========================================================================

-- featuringArtistId = Boomy-User-ID fuer alle Tracks in einem Hardphonk-Pool.
-- Pool-Match laeuft via slug ODER name (case-insensitive) — wir akzeptieren
-- "hardphonk", "hard-phonk", "phonk-halbki" als Hinweis auf Hybrid-Pool.
UPDATE "tracks"
SET "featuringArtistId" = (SELECT "id" FROM "users" WHERE LOWER("username") = 'boomy' LIMIT 1)
WHERE "id" IN (
    SELECT pt."trackId" FROM "pool_tracks" pt
    INNER JOIN "pools" p ON pt."poolId" = p."id"
    WHERE LOWER(p."slug") LIKE '%hardphonk%'
       OR LOWER(p."name") LIKE '%hardphonk%'
       OR LOWER(p."name") LIKE '%hard phonk%'
)
AND (SELECT "id" FROM "users" WHERE LOWER("username") = 'boomy' LIMIT 1) IS NOT NULL;

-- AI-Disclosure auf ai_assisted setzen wo Featuring jetzt gesetzt ist
-- (Boomy-Featuring impliziert AI-Anteil → ai_assisted, Source='boomy').
UPDATE "tracks"
SET "aiDisclosure" = 'ai_assisted',
    "aiSource" = 'boomy'
WHERE "featuringArtistId" = (SELECT "id" FROM "users" WHERE LOWER("username") = 'boomy' LIMIT 1)
  AND "aiDisclosure" != 'ai_generated';
-- Reine Boomy-Tracks (ai_generated) bleiben unangetastet — die haben
-- keinen 4Flow-Hauptartist + Boomy-Feature, sondern Boomy ist die Hauptperson.

-- ===========================================================================
-- 3) Test-User MiniFlow aufraeumen (cascade-clean child records, dann user)
-- ===========================================================================
-- Kinder zuerst purgen (FK-Constraint-frei).
DELETE FROM "votes"
WHERE "userId" IN (SELECT "id" FROM "users" WHERE "username" = 'MiniFlow');

DELETE FROM "wall_posts"
WHERE "authorId" IN (SELECT "id" FROM "users" WHERE "username" = 'MiniFlow');

DELETE FROM "track_request_votes"
WHERE "userId" IN (SELECT "id" FROM "users" WHERE "username" = 'MiniFlow');

DELETE FROM "track_requests"
WHERE "requesterId" IN (SELECT "id" FROM "users" WHERE "username" = 'MiniFlow');

DELETE FROM "shout_messages"
WHERE "authorId" IN (SELECT "id" FROM "users" WHERE "username" = 'MiniFlow');

DELETE FROM "security_events"
WHERE "userId" IN (SELECT "id" FROM "users" WHERE "username" = 'MiniFlow');

-- ReleaseSlots: nur assignee löschen, Slot bleibt (assignee=NULL).
UPDATE "release_slots"
SET "assigneeId" = NULL
WHERE "assigneeId" IN (SELECT "id" FROM "users" WHERE "username" = 'MiniFlow');

-- User selbst loeschen — ABER nur wenn er KEINE Tracks/Pools hat (Test-User
-- sollte das eh nicht haben). Bei Tracks/Pools wird der DELETE skipped,
-- die Migration laeuft trotzdem durch (kein FK-Fehler, weil Subquery-Filter).
DELETE FROM "users"
WHERE "username" = 'MiniFlow'
  AND "id" NOT IN (SELECT "artistId" FROM "tracks")
  AND "id" NOT IN (SELECT "uploaderId" FROM "tracks")
  AND "id" NOT IN (SELECT "ownerArtistId" FROM "pools" WHERE "ownerArtistId" IS NOT NULL);
