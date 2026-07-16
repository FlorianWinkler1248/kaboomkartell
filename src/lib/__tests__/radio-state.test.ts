// Integration-Spec für die Crowd-Control-State-Engine (radio-state.ts).
// Läuft SERVER-SEITIG (braucht den generierten Prisma-Client + better-sqlite3) gegen
// eine Wegwerf-SQLite. Setup legt minimal users + die 3 CC-Tabellen an und importiert
// radio-state dynamisch, NACHDEM DATABASE_URL auf die Test-DB zeigt.
// Run: `pnpm exec vitest run src/lib/__tests__/radio-state.test.ts`. Doku: prozesse/kbk-crowd-control.md

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DB = path.resolve('./prisma/test-cc.db')
let state: typeof import('../radio-state') // radio-state-Modul (dynamisch, nach DATABASE_URL-Set)
let prisma: typeof import('../db').default

function wipeDbFiles() {
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }
}

beforeAll(async () => {
  wipeDbFiles()
  const db = new Database(TEST_DB)
  db.exec(`
    CREATE TABLE "users" ("id" TEXT NOT NULL PRIMARY KEY);
    CREATE TABLE "radio_plays" (
      "id" TEXT NOT NULL PRIMARY KEY, "channel" TEXT NOT NULL, "poolId" TEXT NOT NULL,
      "slotKey" TEXT NOT NULL, "trackId" TEXT NOT NULL, "startedAt" DATETIME NOT NULL,
      "endsAt" DATETIME NOT NULL, "source" TEXT NOT NULL DEFAULT 'RANDOM',
      "decisionSeq" INTEGER NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX "radio_plays_channel_decisionSeq_key" ON "radio_plays"("channel","decisionSeq");
    CREATE INDEX "radio_plays_channel_startedAt_idx" ON "radio_plays"("channel","startedAt");
    CREATE INDEX "radio_plays_poolId_startedAt_idx" ON "radio_plays"("poolId","startedAt");
    CREATE TABLE "radio_heads" (
      "channel" TEXT NOT NULL PRIMARY KEY, "decisionSeq" INTEGER NOT NULL DEFAULT 0,
      "currentPlayId" TEXT, "slotKey" TEXT, "candidateIds" TEXT NOT NULL DEFAULT '[]',
      "committedNextTrackId" TEXT, "committedSource" TEXT,
      "pendingNextTrackId" TEXT, "lockedAt" DATETIME, "updatedAt" DATETIME NOT NULL
    );
    CREATE TABLE "radio_votes" (
      "id" TEXT NOT NULL PRIMARY KEY, "channel" TEXT NOT NULL, "decisionSeq" INTEGER NOT NULL,
      "candidateTrackId" TEXT NOT NULL, "userId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX "radio_votes_channel_decisionSeq_userId_key" ON "radio_votes"("channel","decisionSeq","userId");
    CREATE INDEX "radio_votes_channel_decisionSeq_idx" ON "radio_votes"("channel","decisionSeq");
    INSERT INTO "users"("id") VALUES ('u1'),('u2'),('u3'),('u4'),('u5');
  `)
  db.close()

  process.env.DATABASE_URL = `file:${TEST_DB}`
  process.env.RADIO_CROWD_CONTROL = 'on'
  state = await import('../radio-state')
  prisma = (await import('../db')).default
})

afterAll(async () => {
  await prisma?.$disconnect?.()
  wipeDbFiles()
})

beforeEach(async () => {
  await prisma.radioVote.deleteMany({})
  await prisma.radioPlay.deleteMany({})
  await prisma.radioHead.deleteMany({})
})

const CH = 'phonk'
const DUR = 100 // Sekunden pro Track

function makePool(n: number) {
  return {
    id: 'pool1',
    name: 'Phonk',
    genre: 'Phonk',
    tracks: Array.from({ length: n }, (_, i) => ({
      id: `t${i}`,
      title: `Track ${i}`,
      artist: `Artist ${i % 3}`,
      duration: DUR,
      streamUrl: `/api/tracks/t${i}/stream`,
      coverUrl: null,
    })),
  }
}

function makeCtx(startMs: number) {
  return {
    kind: 'weekly',
    id: 'slotA',
    label: 'Phonk Sessions',
    subgenre: null,
    poolId: 'pool1',
    effectiveStart: new Date(startMs),
    effectiveEnd: new Date(startMs + 6 * 60 * 60 * 1000), // 6h-Slot
  }
}

describe('radio-state — Initialisierung', () => {
  it('legt beim ersten Read einen Play + Head an (decisionSeq 1)', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    const np = await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    expect(np).not.toBeNull()
    expect(np.track).toBeTruthy()
    expect(np.positionSeconds).toBeLessThan(2)

    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.decisionSeq).toBe(1)
    expect(JSON.parse(head.candidateIds).length).toBe(5)
  })

  // ADR-033 Kaltstart-Seed: N+1 (committedNextTrackId) wird beim initSlot probabilistisch
  // ohne Votes geseedet → nextTrack ist AB t0 gesetzt (nicht erst nach Lock), ≠ current.
  it('Kaltstart-Seed: committedNextTrackId gesetzt + nextTrack ab t0 (ADR-033)', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    const np = await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.committedNextTrackId).toBeTruthy()
    expect(head.committedSource).toBe('SEED')
    expect(head.committedNextTrackId).not.toBe(np.track.id) // N+1 ≠ aktueller Track
    // nextTrack kommt AB Track-Start (kein Lock nötig — N+1 ist bereits committet).
    expect(np.nextTrack).not.toBeNull()
    expect(np.nextTrack.id).toBe(head.committedNextTrackId)
    // candidateIds = N+2-Fenster: schließt current UND committed (N+1) aus.
    const cands = JSON.parse(head.candidateIds)
    expect(cands).not.toContain(np.track.id)
    expect(cands).not.toContain(head.committedNextTrackId)
  })

  it('Off-Air (kein ctx/pool) → null, kein Head', async () => {
    const np = await state.readNowPlayingState(null, null, new Date(), CH)
    expect(np).toBeNull()
  })
})

describe('radio-state — Vorrücken + Chaining', () => {
  // ADR-033: der neue Play (N+1) ist der vorige committedNextTrackId — NICHT direkt aus dem
  // Vote-Fenster. Das Vote-Fenster (candidateIds) betrifft das übernächste (N+2).
  it('rückt nach Track-Ende vor; startedAt(N+1) == endsAt(N); spielt vorigen committed', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    const head1 = await prisma.radioHead.findUnique({ where: { channel: CH } })
    const committedBefore = head1.committedNextTrackId // der fixe N+1

    // exakt am Track-Ende erneut pollen → Advance
    const np2 = await state.readNowPlayingState(makeCtx(t0), pool, new Date(play1.endsAt.getTime() + 10), CH)
    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.decisionSeq).toBe(2)
    const play2 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 2 } } })
    expect(play2.startedAt.getTime()).toBe(play1.endsAt.getTime()) // lückenlose Kette
    expect(play2.trackId).not.toBe(play1.trackId) // kein Sofort-Repeat
    expect(play2.trackId).toBe(committedBefore) // ADR-033: gespielt wird der vorige committed (N+1)
    expect(np2.track.id).toBe(play2.trackId)
    // Nach dem Advance steht ein neues committed (das vormalige N+2) als nextTrack fest.
    expect(head.committedNextTrackId).toBeTruthy()
    expect(np2.nextTrack.id).toBe(head.committedNextTrackId)
  })

  it('Doppel-Advance-Race: zwei parallele Polls → genau EIN neuer Play', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    const due = new Date(play1.endsAt.getTime() + 10)

    await Promise.all([
      state.readNowPlayingState(makeCtx(t0), pool, due, CH),
      state.readNowPlayingState(makeCtx(t0), pool, due, CH),
    ])

    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.decisionSeq).toBe(2) // NICHT 3
    const count = await prisma.radioPlay.count({ where: { channel: CH } })
    expect(count).toBe(2) // genau ein neuer Play
  })

  // ADR-033: Advance-Race darf committed←pending nur EINMAL rotieren. Das neue committed muss
  // exakt der vorige pendingNextTrackId (gelockter N+2) sein, nicht doppelt rotiert.
  it('Advance-Race mit Rotation: committed ← pending genau einmal (ADR-033)', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    // erst locken (innerhalb LOCK_LEAD) → pendingNextTrackId (N+2-Gewinner) steht fest
    const lockTime = new Date(play1.endsAt.getTime() - state.VOTE_CLOSE_LEAD_MS + 2_000)
    await state.readNowPlayingState(makeCtx(t0), pool, lockTime, CH)
    const locked = await prisma.radioHead.findUnique({ where: { channel: CH } })
    const pendingN2 = locked.pendingNextTrackId
    expect(pendingN2).toBeTruthy()

    const due = new Date(play1.endsAt.getTime() + 10)
    await Promise.all([
      state.readNowPlayingState(makeCtx(t0), pool, due, CH),
      state.readNowPlayingState(makeCtx(t0), pool, due, CH),
    ])

    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.decisionSeq).toBe(2)
    expect(await prisma.radioPlay.count({ where: { channel: CH } })).toBe(2) // genau 1 neuer Play
    // committed←pending korrekt: das neue committed ist der gelockte N+2-Gewinner.
    expect(head.committedNextTrackId).toBe(pendingN2)
    expect(head.pendingNextTrackId).toBeNull() // Lock fürs neue Fenster zurückgesetzt
    expect(head.lockedAt).toBeNull()
  })

  it('Catch-up über mehrere Tracks: lückenlose decisionSeq, gekettete Zeiten', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    // 5 Tracks (à 100s) später pollen
    const np = await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0 + 5 * DUR * 1000 + 5_000), CH)
    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.decisionSeq).toBeGreaterThanOrEqual(5)
    // der aktuelle Play läuft jetzt wirklich (now liegt in [startedAt, endsAt))
    const cur = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: head.decisionSeq } } })
    const now = t0 + 5 * DUR * 1000 + 5_000
    expect(cur.startedAt.getTime()).toBeLessThanOrEqual(now)
    expect(cur.endsAt.getTime()).toBeGreaterThan(now)
    expect(np.track.id).toBe(cur.trackId)
    // ADR-033: committed←pending pro Catch-up-Schritt korrekt rotiert → für den jetzt
    // laufenden current steht wieder ein gültiges committed (nextTrack) bereit.
    expect(head.committedNextTrackId).toBeTruthy()
    expect(np.nextTrack.id).toBe(head.committedNextTrackId)
    // committed ≠ current (kein Sofort-Repeat des laufenden Tracks als „nächster").
    expect(head.committedNextTrackId).not.toBe(cur.trackId)
  })

  // ADR-033: committedNextTrackId zeigt auf einen inzwischen de-publizierten Track →
  // advanceFrom-Pool-Guard fällt auf resolveWinner zurück (kein Crash, kein Sequenz-Skip).
  it('committed-Pool-Fallback: de-publizierter committed → resolveWinner spielt sendefähigen Track', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    // committed auf einen Track setzen, der NICHT (mehr) im Pool ist (de-publiziert).
    await prisma.radioHead.update({
      where: { channel: CH },
      data: { committedNextTrackId: 'gone-from-pool', committedSource: 'RANDOM', pendingNextTrackId: null, lockedAt: null },
    })
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    const np2 = await state.readNowPlayingState(makeCtx(t0), pool, new Date(play1.endsAt.getTime() + 10), CH)
    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.decisionSeq).toBe(2)
    const play2 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 2 } } })
    // gespielter Track ist sendefähig (im Pool), nicht der de-publizierte committed.
    expect(play2.trackId).not.toBe('gone-from-pool')
    expect(pool.tracks.some((t) => t.id === play2.trackId)).toBe(true)
    expect(np2.track.id).toBe(play2.trackId)
    // kein Sofort-Repeat (ADR-026): der neue committed (dann-N+1) ist NICHT der gerade gespielte Track.
    expect(head.committedNextTrackId).toBeTruthy()
    expect(head.committedNextTrackId).not.toBe(play2.trackId)
  })
})

describe('radio-state — Lock + Voting', () => {
  it('lockt das Fenster LOCK_LEAD vor Track-Ende und friert den Gewinner ein', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })

    // kurz vor Ende pollen (innerhalb LOCK_LEAD)
    const lockTime = new Date(play1.endsAt.getTime() - state.VOTE_CLOSE_LEAD_MS + 2_000)
    await state.readNowPlayingState(makeCtx(t0), pool, lockTime, CH)
    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.lockedAt).not.toBeNull()
    expect(head.pendingNextTrackId).toBeTruthy()
  })

  // ADR-033: Ein Vote betrifft das ÜBERNÄCHSTE Lied (N+2). Der gevotete Track wird also NICHT
  // beim nächsten Advance (das ist der fixe committed/N+1), sondern erst beim ÜBERNÄCHSTEN
  // Advance gespielt — die Mehrheit wirkt nach ZWEI Advances.
  it('Mehrheits-Vote bestimmt den ÜBERNÄCHSTEN Track (wirkt nach 2 Advances)', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    let head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    const cands = JSON.parse(head.candidateIds) // N+2-Fenster
    const target = cands[3] // irgendein Kandidat, nicht der Top-Prob
    const committedN1 = head.committedNextTrackId // der fixe N+1 — wird zuerst gespielt

    // Votes fürs N+2-Fenster, innerhalb des offenen Fensters (Track startet t0, Fenster ab t0+20s).
    const voteNow = new Date(t0 + 25_000)
    for (const u of ['u1', 'u2', 'u3']) {
      const r = await state.castVote(CH, head.decisionSeq, target, u, voteNow)
      expect(r.status).toBe(200)
    }
    await state.castVote(CH, head.decisionSeq, cands[0], 'u4', voteNow) // 1 Gegenstimme

    // 1. Advance → spielt den fixen N+1 (committedN1), NICHT den gevoteten N+2.
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(play1.endsAt.getTime() + 10), CH)
    const play2 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 2 } } })
    expect(play2.trackId).toBe(committedN1) // erst der vorher fixe N+1
    expect(play2.trackId).not.toBe(target)
    // committed steht jetzt auf dem gevoteten N+2-Gewinner (target).
    const head2 = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head2.committedNextTrackId).toBe(target)
    expect(head2.committedSource).toBe('VOTE')

    // 2. Advance → spielt jetzt den gevoteten Track (das ehemalige N+2).
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(play2.endsAt.getTime() + 10), CH)
    const play3 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 3 } } })
    expect(play3.trackId).toBe(target)
    expect(play3.source).toBe('VOTE')
  })

  it('castVote lehnt stale/locked/fremde Kandidaten ab', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    const voteNow = new Date(t0 + 25_000) // im offenen Fenster

    // falsches decisionSeq
    expect((await state.castVote(CH, head.decisionSeq + 99, JSON.parse(head.candidateIds)[0], 'u1', voteNow)).status).toBe(409)
    // Nicht-Kandidat
    expect((await state.castVote(CH, head.decisionSeq, 't19-not-candidate', 'u1', voteNow)).status).toBe(400)
    // gültig
    expect((await state.castVote(CH, head.decisionSeq, JSON.parse(head.candidateIds)[0], 'u1', voteNow)).status).toBe(200)
    // Umentscheiden (Upsert, kein Fehler)
    expect((await state.castVote(CH, head.decisionSeq, JSON.parse(head.candidateIds)[1], 'u1', voteNow)).status).toBe(200)
    const votes = await prisma.radioVote.count({ where: { channel: CH, userId: 'u1' } })
    expect(votes).toBe(1) // nur eine Stimme pro User/Fenster
  })

  it('keine Stimmen → seeded-deterministischer Gewinner (reproduzierbar)', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    // zweimal dieselbe Ausgangslage → gleicher Fallback-Gewinner
    const run = async () => {
      await prisma.radioVote.deleteMany({})
      await prisma.radioPlay.deleteMany({})
      await prisma.radioHead.deleteMany({})
      await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
      const p1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
      await state.readNowPlayingState(makeCtx(t0), pool, new Date(p1.endsAt.getTime() + 10), CH)
      const p2 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 2 } } })
      return p2.trackId
    }
    const a = await run()
    const b = await run()
    expect(a).toBe(b)
  })
})

describe('radio-state — nextTrack ab Track-Start (ADR-033, ersetzt Lock-Disziplin 05.06.2026)', () => {
  it('liefert nextTrack == committedNextTrackId AB Track-Start (kein Lock nötig)', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    // frisch initialisiert, weit vor LOCK_LEAD → Fenster (fürs N+2) offen, kein pending …
    const np = await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0 + 1_000), CH)
    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.lockedAt).toBeNull()
    expect(head.pendingNextTrackId).toBeNull()
    // … und DENNOCH ein nextTrack: N+1 (committedNextTrackId) steht ab Track-Start fest.
    // Das ist stärker als die alte Lock-Disziplin — N+1 ist der committete Gewinner der
    // Vorrunde, nicht der unsichere Leader des offenen (jetzt N+2-)Fensters.
    expect(head.committedNextTrackId).toBeTruthy()
    expect(np.nextTrack).not.toBeNull()
    expect(np.nextTrack.id).toBe(head.committedNextTrackId)
  })

  it('nextTrack bleibt committedNextTrackId, auch nachdem das N+2-Fenster gelockt ist', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    // innerhalb LOCK_LEAD pollen → lockt das N+2-Fenster (pendingNextTrackId = N+2-Gewinner)
    const lockTime = new Date(play1.endsAt.getTime() - state.VOTE_CLOSE_LEAD_MS + 2_000)
    const np = await state.readNowPlayingState(makeCtx(t0), pool, lockTime, CH)
    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.pendingNextTrackId).toBeTruthy() // N+2-Gewinner eingefroren
    // nextTrack ist UNVERÄNDERT N+1 (committed) — nicht der gelockte N+2 (pending).
    expect(np.nextTrack).not.toBeNull()
    expect(np.nextTrack.id).toBe(head.committedNextTrackId)
    expect(np.nextTrack.id).not.toBe(head.pendingNextTrackId)
  })

  // Live-Migration (ADR-033): Bestands-Head hat committedNextTrackId=null. readNowPlayingState
  // liefert dann nextTrack=null (Recovery-Poll), advanceFrom heilt selbst (resolveWinner).
  it('committed==null Migrationspfad: nextTrack=null, Advance setzt neues committed', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    // simuliere Bestands-Head direkt nach Deploy: committed (+ pending) auf null setzen.
    await prisma.radioHead.update({
      where: { channel: CH },
      data: { committedNextTrackId: null, committedSource: null, pendingNextTrackId: null, lockedAt: null },
    })
    const npBefore = await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0 + 1_000), CH)
    expect(npBefore.nextTrack).toBeNull() // kein committed → kein nextTrack (Recovery greift)

    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    const np2 = await state.readNowPlayingState(makeCtx(t0), pool, new Date(play1.endsAt.getTime() + 10), CH)
    // advanceFrom hat N+1 selbstheilend via resolveWinner aufgelöst (kein Crash, kein Skip).
    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.decisionSeq).toBe(2)
    const play2 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 2 } } })
    expect(play2.trackId).toBeTruthy()
    expect(np2.track.id).toBe(play2.trackId)
    // und für den neuen current ist wieder ein committed gesetzt.
    expect(head.committedNextTrackId).toBeTruthy()
    // kein Sofort-Repeat (ADR-026): das neue committed (dann-N+1) ist NICHT der gerade gespielte
    // Track — sonst liefe derselbe Track beim Deploy-Übergang hörbar zweimal in Folge.
    expect(head.committedNextTrackId).not.toBe(play2.trackId)
  })
})

describe('radio-state — currentSource/currentDecisionSeq durchreichen (Agency-Loop, ADR-033)', () => {
  it('readNowPlayingState reicht source + decisionSeq des laufenden Plays durch', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    const np = await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    // Erster Play ist seeded → source 'SEED', decisionSeq 1. Beides muss im Result stehen.
    expect(np.currentSource).toBe(play1.source)
    expect(np.currentSource).toBe('SEED')
    expect(np.currentDecisionSeq).toBe(play1.decisionSeq)
    expect(np.currentDecisionSeq).toBe(1)
  })

  it('nach Advance: currentSource == RadioPlay.source des neuen Plays, decisionSeq erhöht', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    const np2 = await state.readNowPlayingState(makeCtx(t0), pool, new Date(play1.endsAt.getTime() + 10), CH)
    const play2 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 2 } } })
    expect(np2.currentDecisionSeq).toBe(2)
    expect(np2.currentSource).toBe(play2.source)
  })

  it('readGrace reicht source + decisionSeq des ausspielenden Tracks durch', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    // Slot mit kurzem Ende, danach Grace: Track läuft über das Slot-Ende hinaus aus.
    const shortCtx = {
      kind: 'weekly', id: 'slotA', label: 'Phonk Sessions', subgenre: null, poolId: 'pool1',
      effectiveStart: new Date(t0), effectiveEnd: new Date(t0 + 10_000), // 10s-Slot, Track 100s
    }
    await state.readNowPlayingState(shortCtx, pool, new Date(t0), CH)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    const pools = new Map([['pool1', pool]])
    // nach Slot-Ende, aber noch im laufenden Track (z.B. 30s nach Start) → Grace.
    const grace = await state.readGrace(CH, new Date(t0 + 30_000), pools)
    expect(grace).not.toBeNull()
    expect(grace.currentDecisionSeq).toBe(play1.decisionSeq)
    expect(grace.currentSource).toBe(play1.source)
  })
})

describe('radio-state — Vote-Fenster (festes 20s/20s, Radio Sync v2)', () => {
  it('windowStartMs = startedAt + 20s', () => {
    expect(state.windowStartMs(new Date(1_000_000))).toBe(1_020_000)
  })
  it('windowEndMs = endsAt − 20s, geklemmt auf >= startedAt', () => {
    expect(state.windowEndMs(new Date(1_000_000), new Date(1_100_000))).toBe(1_080_000)
    // kurzer Track: Lock nie vor dem Fenster-Start
    expect(state.windowEndMs(new Date(1_000_000), new Date(1_010_000))).toBe(1_000_000)
  })
  it('isVotableDuration: ab 50s votebar, darunter Booth-Pick', () => {
    expect(state.isVotableDuration(new Date(0), new Date(50_000))).toBe(true)
    expect(state.isVotableDuration(new Date(0), new Date(49_999))).toBe(false)
  })
})

describe('radio-state — Vote-Fenster-Validierung', () => {
  it('lehnt Votes ab, bevor das Fenster öffnet (now < start+20s), erlaubt sie danach', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    const cand = JSON.parse(head.candidateIds)[0]
    // 5s nach Start → Fenster noch zu
    expect((await state.castVote(CH, head.decisionSeq, cand, 'u1', new Date(t0 + 5_000))).status).toBe(409)
    // 25s nach Start → offen
    expect((await state.castVote(CH, head.decisionSeq, cand, 'u1', new Date(t0 + 25_000))).status).toBe(200)
  })

  it('kurzer Track (<50s) → getCrowdControl inaktiv (Booth-Pick statt Voting)', async () => {
    const shortPool = {
      id: 'pool1', name: 'Phonk', genre: 'Phonk',
      tracks: Array.from({ length: 20 }, (_, i) => ({
        id: `s${i}`, title: `S${i}`, artist: `A${i % 3}`, duration: 30,
        streamUrl: `/api/tracks/s${i}/stream`, coverUrl: null,
      })),
    }
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), shortPool, new Date(t0), CH)
    const cc = await state.getCrowdControl(makeCtx(t0), shortPool, new Date(t0 + 5_000), CH, null)
    expect(cc.active).toBe(false)
  })
})

describe('radio-state — getCrowdControl Fenster-Felder', () => {
  it('liefert windowStartsAt = start+20s und windowEndsAt = end−20s', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    const cc = await state.getCrowdControl(makeCtx(t0), pool, new Date(t0 + 1000), CH, null)
    expect(new Date(cc.windowStartsAt).getTime()).toBe(play1.startedAt.getTime() + 20_000)
    expect(new Date(cc.windowEndsAt).getTime()).toBe(play1.endsAt.getTime() - 20_000)
  })
})

describe('radio-state — getCrowdControl', () => {
  it('liefert Kandidaten + Tally + myVote', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    const target = JSON.parse(head.candidateIds)[2]
    await state.castVote(CH, head.decisionSeq, target, 'u1', new Date(t0 + 25_000))

    const cc = await state.getCrowdControl(makeCtx(t0), pool, new Date(t0 + 25_000), CH, 'u1')
    expect(cc.active).toBe(true)
    expect(cc.candidates.length).toBe(5)
    expect(cc.myVote).toBe(target)
    expect(cc.candidates.find((c) => c.trackId === target).votes).toBe(1)
    // ADR-033: UP NEXT (N+1) wird als fixe upNext*-Felder geliefert (= committedNextTrackId).
    expect(cc.upNextTrackId).toBe(head.committedNextTrackId)
    expect(cc.upNextTitle).toBeTruthy()
    // candidates (N+2-Fenster) enthalten NICHT das fixe UP NEXT (N+1).
    expect(cc.candidates.some((c) => c.trackId === cc.upNextTrackId)).toBe(false)
  })

  it('Kill-Switch off → inaktiv', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    process.env.RADIO_CROWD_CONTROL = 'off'
    const cc = await state.getCrowdControl(makeCtx(t0), pool, new Date(t0), CH, null)
    expect(cc.active).toBe(false)
    process.env.RADIO_CROWD_CONTROL = 'on'
  })
})

// Timetable-Variety + Smooth-Switch (Session vom 01.07.2026): ein Slot-Wechsel während
// des laufenden Betriebs darf weder den laufenden Track abschneiden noch ein bereits
// demokratisch gelocktes Voting-Fenster kommentarlos verwerfen. advanceFrom() ist die
// einzige Fortschreib-Route; initSlot() bleibt echten Kaltstart-Fällen vorbehalten.
function makePool2(n: number, id = 'pool2') {
  return {
    id,
    name: 'Brazilian Phonk',
    genre: 'Brazilian Phonk',
    tracks: Array.from({ length: n }, (_, i) => ({
      id: `${id}-t${i}`,
      title: `${id} Track ${i}`,
      artist: `Artist ${i % 3}`,
      duration: DUR,
      streamUrl: `/api/tracks/${id}-t${i}/stream`,
      coverUrl: null,
    })),
  }
}

function makeCtx2(startMs: number, poolId: string, slotId: string) {
  return {
    kind: 'weekly',
    id: slotId,
    label: 'Brazilian Sessions',
    subgenre: null,
    poolId,
    effectiveStart: new Date(startMs),
    effectiveEnd: new Date(startMs + 6 * 60 * 60 * 1000),
  }
}

describe('radio-state — Slot-Wechsel während laufendem Betrieb (weiche Übernahme)', () => {
  it('kein Cutover: laufender Track spielt trotz gewechseltem ctx/pool bis endsAt weiter', async () => {
    const pool1 = makePool(20)
    const pool2 = makePool2(20)
    const poolMap = new Map([['pool1', pool1], ['pool2', pool2]])
    const t0 = 1_900_000_000_000

    await state.readNowPlayingState(makeCtx(t0), pool1, new Date(t0), CH, poolMap)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })

    // Poll WÄHREND der Track noch läuft (30s von 100s), aber ctx/pool zeigen bereits den
    // NÄCHSTEN Slot (Sendeplan hat gewechselt) — darf NICHT sofort resetten.
    const midCtx = makeCtx2(t0, 'pool2', 'slotB')
    const np = await state.readNowPlayingState(midCtx, pool2, new Date(t0 + 30_000), CH, poolMap)
    expect(np.track.id).toBe(play1.trackId) // derselbe Track, kein Abbruch

    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.decisionSeq).toBe(1) // kein Advance, kein Reset
  })

  it('weiche Übernahme: N+1 (schon vor dem Wechsel committet) spielt unverändert, gelockter N+2-Gewinner rotiert zum neuen committedNextTrackId', async () => {
    const pool1 = makePool(20)
    const pool2 = makePool2(20)
    const poolMap = new Map([['pool1', pool1], ['pool2', pool2]])
    const t0 = 1_900_000_000_000

    await state.readNowPlayingState(makeCtx(t0), pool1, new Date(t0), CH, poolMap)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    const head1 = await prisma.radioHead.findUnique({ where: { channel: CH } })
    // ADR-033: N+1 steht schon AB Track-Start fest (SEED-Kaltstart), unabhängig vom Lock.
    const committedN1 = head1.committedNextTrackId
    expect(committedN1).toBeTruthy()

    // Lock NOCH mit dem alten Slot/Pool (Fenster gehört zu pool1) — betrifft N+2.
    const lockTime = new Date(play1.endsAt.getTime() - state.VOTE_CLOSE_LEAD_MS + 2_000)
    await state.readNowPlayingState(makeCtx(t0), pool1, lockTime, CH, poolMap)
    const locked = await prisma.radioHead.findUnique({ where: { channel: CH } })
    const pendingFromOldPool = locked.pendingNextTrackId
    expect(pendingFromOldPool).toBeTruthy()
    expect(pool1.tracks.some((t) => t.id === pendingFromOldPool)).toBe(true)

    // Advance passiert NACH dem Slot-Wechsel: ctx/pool zeigen jetzt pool2.
    const midCtx = makeCtx2(t0, 'pool2', 'slotB')
    const due = new Date(play1.endsAt.getTime() + 10)
    const np2 = await state.readNowPlayingState(midCtx, pool2, due, CH, poolMap)

    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.decisionSeq).toBe(2) // advanceFrom, NICHT initSlot (kein Reset auf 1)
    const play2 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 2 } } })
    // N+1 spielt unverändert (war schon vor dem Wechsel fix, aus pool1) — kein Cutover.
    expect(play2.trackId).toBe(committedN1)
    expect(np2.track.id).toBe(committedN1)
    // readNowPlayingState findet den Track trotz Pool-Herkunft aus pool1 (poolMap-Fix).
    expect(pool1.tracks.some((t) => t.id === np2.track.id)).toBe(true)
    // der bereits demokratisch gelockte N+2-Gewinner (aus pool1) wird NICHT verworfen,
    // sondern rotiert zum neuen committedNextTrackId (spielt als N+1 der nächsten Runde).
    expect(head.committedNextTrackId).toBe(pendingFromOldPool)
    // die NEUEN N+2-Kandidaten (fürs übernächste Fenster) kommen jetzt aus dem neuen Pool.
    const cands = JSON.parse(head.candidateIds)
    expect(cands.length).toBeGreaterThan(0)
    expect(cands.every((id) => pool2.tracks.some((t) => t.id === id))).toBe(true)
  })

  it('getCrowdControl bleibt populiert + markiert transitioning, solange der alte Track noch läuft', async () => {
    const pool1 = makePool(20)
    const pool2 = makePool2(20)
    const poolMap = new Map([['pool1', pool1], ['pool2', pool2]])
    const t0 = 1_900_000_000_000

    await state.readNowPlayingState(makeCtx(t0), pool1, new Date(t0), CH, poolMap)

    const midCtx = makeCtx2(t0, 'pool2', 'slotB')
    const cc = await state.getCrowdControl(midCtx, pool2, new Date(t0 + 25_000), CH, null, poolMap)
    expect(cc.active).toBe(true)
    expect(cc.candidates.length).toBe(5)
    expect(cc.candidates.every((c) => pool1.tracks.some((t) => t.id === c.trackId))).toBe(true)
    expect(cc.transitioning).toBe(true)
  })

  it('kein Slot-Wechsel (gleicher ctx/pool über die gesamte Laufzeit) → transitioning bleibt false', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const cc = await state.getCrowdControl(makeCtx(t0), pool, new Date(t0 + 25_000), CH, null)
    expect(cc.transitioning).toBe(false)
  })
})

// Fix 16.07.2026: lockWindowIfDue filterte die eingefrorenen Kandidaten gegen den Pool des
// LAUFENDEN Plays (current.poolId). Nach einer weichen Slot-Übernahme (ADR-034) trägt
// current.poolId aber noch den ALTEN Pool, während die Kandidaten längst aus dem NEUEN
// Slot-Pool stammen — der Filter leerte die Liste, der Fallback baute Alt-Genre-Ersatz und
// verewigte so das alte Genre über die Slot-Grenze (phonk-Channel spielte >10 h keinen
// Brazilian-Slot-Inhalt). Neu: Auflösbarkeits-Filter (Fenster-Pool ODER frischer Slot-Pool),
// Degenerat-Fallback baut aus dem FRISCHEN Slot-Pool. Getestet über die öffentliche API
// (readNowPlayingState lockt via lockWindowIfDue).
describe('lockWindowIfDue — weiche Slot-Übernahme (Fix 16.07.2026)', () => {
  it('Kern-Regression: Kandidaten aus dem neuen Slot-Pool überleben den Lock, obwohl current noch aus dem alten Pool spielt', async () => {
    const pool1 = makePool(20)
    const pool2 = makePool2(20)
    const poolMap = new Map([['pool1', pool1], ['pool2', pool2]])
    const t0 = 1_900_000_000_000

    // Zustand nach weicher Übernahme nachstellen: current-Play läuft noch aus pool1,
    // die N+2-Kandidaten wurden aber schon aus dem NEUEN Slot-Pool (pool2) gebaut.
    await state.readNowPlayingState(makeCtx(t0), pool1, new Date(t0), CH, poolMap)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    expect(play1.poolId).toBe('pool1')
    const headBefore = await prisma.radioHead.findUnique({ where: { channel: CH } })
    const committedBefore = headBefore.committedNextTrackId
    const pool2Candidates = pool2.tracks.slice(0, 5).map((t) => t.id)
    await prisma.radioHead.update({
      where: { channel: CH },
      data: { candidateIds: JSON.stringify(pool2Candidates), pendingNextTrackId: null, lockedAt: null },
    })

    // Lock-fälliger Poll (innerhalb VOTE_CLOSE_LEAD) mit ctx/pool = NEUER Slot (pool2).
    const lockTime = new Date(play1.endsAt.getTime() - state.VOTE_CLOSE_LEAD_MS + 2_000)
    await state.readNowPlayingState(makeCtx2(t0, 'pool2', 'slotB'), pool2, lockTime, CH, poolMap)

    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.lockedAt).not.toBeNull()
    expect(head.pendingNextTrackId).toBeTruthy()
    // DER Bug: vorher leerte der current.poolId-Filter die pool2-Kandidaten und der
    // Fallback lockte einen pool1-Track. Jetzt: Gewinner ∈ eingefrorene pool2-Kandidaten.
    expect(pool2Candidates).toContain(head.pendingNextTrackId)
    expect(pool2.tracks.some((t) => t.id === head.pendingNextTrackId)).toBe(true)
    expect(pool1.tracks.some((t) => t.id === head.pendingNextTrackId)).toBe(false)
    // Der Lock fasst das committete N+1 nicht an.
    expect(head.committedNextTrackId).toBe(committedBefore)
  })

  it('Degenerat-Fallback: nirgends auflösbare Kandidaten → Lock lockt trotzdem, Gewinner aus dem FRISCHEN Slot-Pool', async () => {
    const pool1 = makePool(20)
    const pool2 = makePool2(20)
    const poolMap = new Map([['pool1', pool1], ['pool2', pool2]])
    const t0 = 1_900_000_000_000

    await state.readNowPlayingState(makeCtx(t0), pool1, new Date(t0), CH, poolMap)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    // Kandidaten, die in KEINEM Pool existieren (alle de-publiziert).
    await prisma.radioHead.update({
      where: { channel: CH },
      data: { candidateIds: JSON.stringify(['ghost-a', 'ghost-b', 'ghost-c', 'ghost-d', 'ghost-e']), pendingNextTrackId: null, lockedAt: null },
    })

    const lockTime = new Date(play1.endsAt.getTime() - state.VOTE_CLOSE_LEAD_MS + 2_000)
    await state.readNowPlayingState(makeCtx2(t0, 'pool2', 'slotB'), pool2, lockTime, CH, poolMap)

    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.lockedAt).not.toBeNull()
    expect(head.pendingNextTrackId).toBeTruthy()
    // Fallback konvergiert zum Genre des AKTIVEN Slots (pool2) — nicht zum alten pool1.
    expect(pool2.tracks.some((t) => t.id === head.pendingNextTrackId)).toBe(true)
    expect(pool1.tracks.some((t) => t.id === head.pendingNextTrackId)).toBe(false)
  })

  it('Read-Pfad symmetrisch (Review-Finding 16.07.): getCrowdControl zeigt die pool2-Kandidaten im Takeover-Fenster — Widget bleibt sichtbar + votebar', async () => {
    const pool1 = makePool(20)
    const pool2 = makePool2(20)
    const poolMap = new Map([['pool1', pool1], ['pool2', pool2]])
    const t0 = 1_900_000_000_000

    // Zustand nach weicher Übernahme: current-Play aus pool1, Kandidaten aus pool2.
    await state.readNowPlayingState(makeCtx(t0), pool1, new Date(t0), CH, poolMap)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    expect(play1.poolId).toBe('pool1')
    const pool2Candidates = pool2.tracks.slice(0, 5).map((t) => t.id)
    await prisma.radioHead.update({
      where: { channel: CH },
      data: { candidateIds: JSON.stringify(pool2Candidates), pendingNextTrackId: null, lockedAt: null },
    })

    // Read VOR dem Lock-Fenster (mitten im Takeover-Track), ctx/pool = NEUER Slot.
    const cc = await state.getCrowdControl(
      makeCtx2(t0, 'pool2', 'slotB'), pool2, new Date(t0 + 30_000), CH, null, poolMap,
    )
    // DER Read-Pfad-Bug: vorher leerte der current.poolId-Filter die Liste → active=false
    // → Widget unsichtbar, während der Lock über genau diese Kandidaten entschied.
    expect(cc.active).toBe(true)
    expect(cc.candidates.map((c) => c.trackId).sort()).toEqual([...pool2Candidates].sort())
    // Kandidaten sind voll aufgelöst (Titel aus pool2, kein 'Unknown'-Fallback).
    for (const c of cc.candidates) expect(c.title).not.toBe('Unknown')
    // Takeover-Signal fürs Widget gesetzt.
    expect(cc.transitioning).toBe(true)
  })

  it('Normalbetrieb unverändert: gleicher Pool überall → Gewinner ∈ eingefrorene candidateIds', async () => {
    const pool = makePool(20)
    const t0 = 1_900_000_000_000
    await state.readNowPlayingState(makeCtx(t0), pool, new Date(t0), CH)
    const play1 = await prisma.radioPlay.findUnique({ where: { channel_decisionSeq: { channel: CH, decisionSeq: 1 } } })
    const headBefore = await prisma.radioHead.findUnique({ where: { channel: CH } })
    const frozen = JSON.parse(headBefore.candidateIds)
    expect(frozen.length).toBe(5)

    const lockTime = new Date(play1.endsAt.getTime() - state.VOTE_CLOSE_LEAD_MS + 2_000)
    await state.readNowPlayingState(makeCtx(t0), pool, lockTime, CH)

    const head = await prisma.radioHead.findUnique({ where: { channel: CH } })
    expect(head.lockedAt).not.toBeNull()
    // Kein Verhaltens-Drift: der Gewinner kommt aus dem eingefrorenen Fenster.
    expect(frozen).toContain(head.pendingNextTrackId)
  })
})
