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
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "artistId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    CONSTRAINT "tracks_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tracks_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_tracks" ("artistId", "bpm", "coverUrl", "createdAt", "description", "duration", "fileName", "filePath", "fileSize", "genre", "id", "playCount", "slug", "sortOrder", "status", "title", "updatedAt", "uploaderId") SELECT "artistId", "bpm", "coverUrl", "createdAt", "description", "duration", "fileName", "filePath", "fileSize", "genre", "id", "playCount", "slug", "sortOrder", "status", "title", "updatedAt", "uploaderId" FROM "tracks";
DROP TABLE "tracks";
ALTER TABLE "new_tracks" RENAME TO "tracks";
CREATE UNIQUE INDEX "tracks_slug_key" ON "tracks"("slug");
CREATE INDEX "tracks_status_idx" ON "tracks"("status");
CREATE INDEX "tracks_artistId_idx" ON "tracks"("artistId");
CREATE INDEX "tracks_slug_idx" ON "tracks"("slug");
CREATE INDEX "tracks_trackType_idx" ON "tracks"("trackType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
