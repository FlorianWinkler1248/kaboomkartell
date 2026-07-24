-- CreateTable
CREATE TABLE "artist_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "headerUrl" TEXT,
    "socialSoundcloud" TEXT,
    "socialInstagram" TEXT,
    "socialTelegram" TEXT,
    "socialWebsite" TEXT,
    "claimTokenHash" TEXT,
    "claimTokenExpiry" DATETIME,
    "userId" TEXT,
    "claimedAt" DATETIME,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "artist_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "upload_submissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "upload_submissions_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "upload_submissions_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "isrc" TEXT,
    "label" TEXT,
    "contributors" TEXT,
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
    "artistProfileId" TEXT,
    CONSTRAINT "tracks_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tracks_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tracks_featuringArtistId_fkey" FOREIGN KEY ("featuringArtistId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tracks_artistProfileId_fkey" FOREIGN KEY ("artistProfileId") REFERENCES "artist_profiles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_tracks" ("aiDisclosure", "aiSource", "artistId", "auraCount", "bpm", "coverUrl", "createdAt", "description", "duration", "featuringArtistId", "fileName", "filePath", "fileSize", "genre", "id", "isPublic", "playCount", "publishedAt", "scheduledPublishAt", "slug", "sortOrder", "soundcloudArtwork", "soundcloudEmbedUrl", "soundcloudUrl", "status", "susCount", "susPercentage", "title", "totalVotes", "trackType", "updatedAt", "uploaderId") SELECT "aiDisclosure", "aiSource", "artistId", "auraCount", "bpm", "coverUrl", "createdAt", "description", "duration", "featuringArtistId", "fileName", "filePath", "fileSize", "genre", "id", "isPublic", "playCount", "publishedAt", "scheduledPublishAt", "slug", "sortOrder", "soundcloudArtwork", "soundcloudEmbedUrl", "soundcloudUrl", "status", "susCount", "susPercentage", "title", "totalVotes", "trackType", "updatedAt", "uploaderId" FROM "tracks";
DROP TABLE "tracks";
ALTER TABLE "new_tracks" RENAME TO "tracks";
CREATE UNIQUE INDEX "tracks_slug_key" ON "tracks"("slug");
CREATE INDEX "tracks_status_idx" ON "tracks"("status");
CREATE INDEX "tracks_isPublic_idx" ON "tracks"("isPublic");
CREATE INDEX "tracks_artistId_idx" ON "tracks"("artistId");
CREATE INDEX "tracks_slug_idx" ON "tracks"("slug");
CREATE INDEX "tracks_trackType_idx" ON "tracks"("trackType");
CREATE INDEX "tracks_scheduledPublishAt_idx" ON "tracks"("scheduledPublishAt");
CREATE INDEX "tracks_artistProfileId_idx" ON "tracks"("artistProfileId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "artist_profiles_slug_key" ON "artist_profiles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "artist_profiles_claimTokenHash_key" ON "artist_profiles"("claimTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "artist_profiles_userId_key" ON "artist_profiles"("userId");

-- CreateIndex
CREATE INDEX "artist_profiles_isPublished_sortOrder_idx" ON "artist_profiles"("isPublished", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "upload_submissions_trackId_key" ON "upload_submissions"("trackId");

-- CreateIndex
CREATE INDEX "upload_submissions_status_createdAt_idx" ON "upload_submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "upload_submissions_submitterId_idx" ON "upload_submissions"("submitterId");

