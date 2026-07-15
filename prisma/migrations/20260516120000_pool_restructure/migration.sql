-- Pool-Restrukturierung 16.05.2026
-- Track.isPublic NEU (Airplay-Gate), Pool.aiContent + Pool.isSource ENTFERNT.
-- isPublic wird beim Table-Rebuild aus dem alten status abgeleitet
-- (status='PUBLISHED' -> isPublic=true), damit das Radio direkt weiterläuft.
-- Siehe ADR im flowsarea-brain.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_tracks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "trackType" TEXT NOT NULL DEFAULT 'LOCAL',
    "fileName" TEXT,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "soundcloudUrl" TEXT,
    "soundcloudEmbedUrl" TEXT,
    "soundcloudArtwork" TEXT,
    "duration" REAL NOT NULL DEFAULT 0,
    "coverUrl" TEXT,
    "genre" TEXT,
    "bpm" INTEGER,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "aiDisclosure" TEXT,
    "aiSource" TEXT,
    "auraCount" INTEGER NOT NULL DEFAULT 0,
    "susCount" INTEGER NOT NULL DEFAULT 0,
    "totalVotes" INTEGER NOT NULL DEFAULT 0,
    "susPercentage" REAL NOT NULL DEFAULT 0,
    "scheduledPublishAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "artistId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "featuringArtistId" TEXT,
    CONSTRAINT "tracks_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tracks_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tracks_featuringArtistId_fkey" FOREIGN KEY ("featuringArtistId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_tracks" ("aiDisclosure", "aiSource", "artistId", "auraCount", "bpm", "coverUrl", "createdAt", "description", "duration", "featuringArtistId", "fileName", "filePath", "fileSize", "genre", "id", "playCount", "publishedAt", "scheduledPublishAt", "slug", "sortOrder", "soundcloudArtwork", "soundcloudEmbedUrl", "soundcloudUrl", "status", "isPublic", "susCount", "susPercentage", "title", "totalVotes", "trackType", "updatedAt", "uploaderId") SELECT "aiDisclosure", "aiSource", "artistId", "auraCount", "bpm", "coverUrl", "createdAt", "description", "duration", "featuringArtistId", "fileName", "filePath", "fileSize", "genre", "id", "playCount", "publishedAt", "scheduledPublishAt", "slug", "sortOrder", "soundcloudArtwork", "soundcloudEmbedUrl", "soundcloudUrl", "status", ("status" = 'PUBLISHED'), "susCount", "susPercentage", "title", "totalVotes", "trackType", "updatedAt", "uploaderId" FROM "tracks";
DROP TABLE "tracks";
ALTER TABLE "new_tracks" RENAME TO "tracks";
CREATE UNIQUE INDEX "tracks_slug_key" ON "tracks"("slug");
CREATE INDEX "tracks_status_idx" ON "tracks"("status");
CREATE INDEX "tracks_isPublic_idx" ON "tracks"("isPublic");
CREATE INDEX "tracks_artistId_idx" ON "tracks"("artistId");
CREATE INDEX "tracks_slug_idx" ON "tracks"("slug");
CREATE INDEX "tracks_trackType_idx" ON "tracks"("trackType");
CREATE INDEX "tracks_scheduledPublishAt_idx" ON "tracks"("scheduledPublishAt");
CREATE TABLE "new_pools" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "genre" TEXT,
    "ownerArtistId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "pools_ownerArtistId_fkey" FOREIGN KEY ("ownerArtistId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_pools" ("createdAt", "description", "genre", "id", "isActive", "name", "ownerArtistId", "slug", "updatedAt") SELECT "createdAt", "description", "genre", "id", "isActive", "name", "ownerArtistId", "slug", "updatedAt" FROM "pools";
DROP TABLE "pools";
ALTER TABLE "new_pools" RENAME TO "pools";
CREATE UNIQUE INDEX "pools_slug_key" ON "pools"("slug");
CREATE INDEX "pools_isActive_idx" ON "pools"("isActive");
CREATE INDEX "pools_genre_idx" ON "pools"("genre");
CREATE INDEX "pools_ownerArtistId_idx" ON "pools"("ownerArtistId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
