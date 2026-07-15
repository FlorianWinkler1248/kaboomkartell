-- Crowd Control (ADR-026) — server-stateful, voting-gesteuertes Radio.
-- Drei neue Tabellen, KEIN Touch an Bestandstabellen (rein additiv).
-- RadioPlay/RadioHead bewusst ohne FK (append-only History / fluechtiger State,
-- defensive Lookups gegen Live-Pool); RadioVote mit FK auf users (CASCADE).
-- Doku + Algorithmus: prozesse/kbk-crowd-control.md

-- RadioPlay — append-only Play-Log (Recency-Quelle + now-playing).
CREATE TABLE "radio_plays" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channel" TEXT NOT NULL,
  "poolId" TEXT NOT NULL,
  "slotKey" TEXT NOT NULL,
  "trackId" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL,
  "endsAt" DATETIME NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'RANDOM',
  "decisionSeq" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "radio_plays_channel_decisionSeq_key" ON "radio_plays"("channel", "decisionSeq");
CREATE INDEX "radio_plays_channel_startedAt_idx" ON "radio_plays"("channel", "startedAt");
CREATE INDEX "radio_plays_poolId_startedAt_idx" ON "radio_plays"("poolId", "startedAt");

-- RadioHead — Singleton pro Channel (aktueller Stand + eingefrorenes Vote-Fenster).
CREATE TABLE "radio_heads" (
  "channel" TEXT NOT NULL PRIMARY KEY,
  "decisionSeq" INTEGER NOT NULL DEFAULT 0,
  "currentPlayId" TEXT,
  "slotKey" TEXT,
  "candidateIds" TEXT NOT NULL DEFAULT '[]',
  "pendingNextTrackId" TEXT,
  "lockedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL
);

-- RadioVote — fluechtige Live-Stimme fuers aktuelle Fenster (FK users, CASCADE).
CREATE TABLE "radio_votes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channel" TEXT NOT NULL,
  "decisionSeq" INTEGER NOT NULL,
  "candidateTrackId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "radio_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "radio_votes_channel_decisionSeq_userId_key" ON "radio_votes"("channel", "decisionSeq", "userId");
CREATE INDEX "radio_votes_channel_decisionSeq_idx" ON "radio_votes"("channel", "decisionSeq");
