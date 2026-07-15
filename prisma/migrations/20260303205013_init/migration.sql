-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MITGLIED',
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "duration" REAL NOT NULL,
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

-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "siteName" TEXT NOT NULL DEFAULT 'KaboomKartell',
    "siteTagline" TEXT NOT NULL DEFAULT 'Digitales Musiklabel by 4Flow',
    "heroTitle" TEXT NOT NULL DEFAULT 'Willkommen beim KBK!',
    "heroSubtitle" TEXT NOT NULL DEFAULT 'Raggatek & Hardtek Community',
    "aboutText" TEXT NOT NULL DEFAULT '',
    "socialLinks" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_slug_key" ON "tracks"("slug");

-- CreateIndex
CREATE INDEX "tracks_status_idx" ON "tracks"("status");

-- CreateIndex
CREATE INDEX "tracks_artistId_idx" ON "tracks"("artistId");

-- CreateIndex
CREATE INDEX "tracks_slug_idx" ON "tracks"("slug");
