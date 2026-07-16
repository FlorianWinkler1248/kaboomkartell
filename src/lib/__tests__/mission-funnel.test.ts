// Kern-Garantien von Mission-Board + Artist-Funnel (ADR-039).
// DB-Teile laufen SERVER-SEITIG gegen eine Wegwerf-SQLite (Muster
// radio-state.test.ts): Setup legt users + missions + mission_acceptances +
// artist_applications an und importiert prisma dynamisch, NACHDEM
// DATABASE_URL auf die Test-DB zeigt. Die zod-/Mail-/Vanity-/Parser-Teile
// testen die Bausteine direkt (Substanz vor Zeremonie — keine Route-Handler-
// Mocks noetig, die Garantien leben in den Bausteinen + im DB-Schema).
// Run: `pnpm exec vitest run src/lib/__tests__/mission-funnel.test.ts`.
// Doku: prozesse/kbk-mission-board.md + prozesse/kbk-artist-onboarding.md

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  createMissionSchema,
  updateMissionSchema,
  artistApplicationSchema,
} from '../validations'
import { showVanity } from '../vanity'
import { buildArtistApplicationEmail } from '../mailer'
import {
  isSafeExternalUrl,
  parseMissionTranslations,
  resolveMissionText,
  serializeMissionTranslations,
} from '../mission-config'
import { toProcessListItem, type ProcessEntry } from '../processes-bundle'

const nodeRequire = createRequire(import.meta.url)
// Build-Skript exportiert den Frontmatter-Parser fuer genau diesen Test
// (require.main-Guard: als Modul geladen baut es NICHT das Bundle).
const { parseFrontmatter } = nodeRequire(
  path.resolve(process.cwd(), 'scripts', 'build-processes-bundle.cjs')
) as {
  parseFrontmatter: (raw: string) => {
    frontmatter: Record<string, unknown>
    body: string
  }
}

const TEST_DB = path.resolve('./prisma/test-mission-funnel.db')
let prisma: typeof import('../db').default

function wipeDbFiles() {
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }
}

function isP2002(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: string }).code === 'P2002'
  )
}

beforeAll(async () => {
  wipeDbFiles()
  const db = new Database(TEST_DB)
  // Spiegelung der @@map-Tabellen aus prisma/schema.prisma — inkl. der beiden
  // unique-Constraints, die die harten Garantien tragen:
  //   mission_acceptances: UNIQUE(missionId, userId)  → 1 Annahme pro User+Mission
  //   artist_applications: UNIQUE(userId)             → 1 Bewerbung pro Account
  db.exec(`
    CREATE TABLE "users" ("id" TEXT NOT NULL PRIMARY KEY);
    CREATE TABLE "missions" (
      "id" TEXT NOT NULL PRIMARY KEY, "slug" TEXT NOT NULL, "title" TEXT NOT NULL,
      "type" TEXT NOT NULL, "summary" TEXT NOT NULL, "body" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'OPEN',
      "progressCurrent" REAL, "progressTarget" REAL, "progressUnit" TEXT,
      "actionUrl" TEXT, "actionLabel" TEXT,
      "translations" TEXT,
      "acceptable" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdBy" TEXT NOT NULL DEFAULT 'flow',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE UNIQUE INDEX "missions_slug_key" ON "missions"("slug");
    CREATE INDEX "missions_status_sortOrder_idx" ON "missions"("status","sortOrder");
    CREATE TABLE "mission_acceptances" (
      "id" TEXT NOT NULL PRIMARY KEY, "missionId" TEXT NOT NULL, "userId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE UNIQUE INDEX "mission_acceptances_missionId_userId_key"
      ON "mission_acceptances"("missionId","userId");
    CREATE INDEX "mission_acceptances_userId_idx" ON "mission_acceptances"("userId");
    CREATE TABLE "artist_applications" (
      "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
      "message" TEXT NOT NULL, "links" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "mailSent" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE UNIQUE INDEX "artist_applications_userId_key" ON "artist_applications"("userId");
    CREATE INDEX "artist_applications_status_idx" ON "artist_applications"("status");
    INSERT INTO "users"("id") VALUES ('u1'),('u2');
  `)
  db.close()

  process.env.DATABASE_URL = `file:${TEST_DB}`
  prisma = (await import('../db')).default
})

afterAll(async () => {
  await prisma?.$disconnect?.()
  wipeDbFiles()
})

beforeEach(async () => {
  await prisma.missionAcceptance.deleteMany({})
  await prisma.artistApplication.deleteMany({})
  await prisma.mission.deleteMany({})
})

async function seedMission(slug = 'recruit-wolves') {
  return prisma.mission.create({
    data: {
      slug,
      title: 'Recruit Wolves',
      type: 'RECRUITING',
      summary: 'Bring humans to the decks.',
      body: '## Do it\n\nSpread the word.',
    },
  })
}

// === (1) Accept-Garantien: @@unique + WITHDRAWN→ACCEPTED als Update =========

describe('mission-funnel — Accept-Garantien (DB-erzwungen)', () => {
  it('Doppel-Accept → P2002 am @@unique(missionId, userId), genau EIN Record', async () => {
    const mission = await seedMission()
    await prisma.missionAcceptance.create({
      data: { missionId: mission.id, userId: 'u1', status: 'ACCEPTED' },
    })

    let err: unknown = null
    try {
      await prisma.missionAcceptance.create({
        data: { missionId: mission.id, userId: 'u1', status: 'ACCEPTED' },
      })
    } catch (e) {
      err = e
    }
    expect(isP2002(err)).toBe(true)
    expect(await prisma.missionAcceptance.count()).toBe(1)
  })

  it('paralleler Doppel-Accept (Race): genau ein create gewinnt, Verlierer P2002', async () => {
    const mission = await seedMission()
    const results = await Promise.allSettled([
      prisma.missionAcceptance.create({
        data: { missionId: mission.id, userId: 'u1', status: 'ACCEPTED' },
      }),
      prisma.missionAcceptance.create({
        data: { missionId: mission.id, userId: 'u1', status: 'ACCEPTED' },
      }),
    ])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    )
    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)
    expect(isP2002(rejected[0].reason)).toBe(true)
    expect(await prisma.missionAcceptance.count()).toBe(1)
  })

  it('Wieder-Annahme nach WITHDRAWN ist ein UPDATE derselben Zeile (Audit-Spur bleibt)', async () => {
    const mission = await seedMission()
    const created = await prisma.missionAcceptance.create({
      data: { missionId: mission.id, userId: 'u1', status: 'ACCEPTED' },
    })
    // Withdraw = Status-Update, kein Delete (Route: DELETE /accept)
    await prisma.missionAcceptance.update({
      where: { id: created.id },
      data: { status: 'WITHDRAWN' },
    })
    // Wieder-Annahme = Update derselben Zeile (Route: POST /accept, WITHDRAWN-Pfad)
    const reAccepted = await prisma.missionAcceptance.update({
      where: { id: created.id },
      data: { status: 'ACCEPTED' },
    })
    expect(reAccepted.id).toBe(created.id)
    expect(reAccepted.status).toBe('ACCEPTED')
    expect(await prisma.missionAcceptance.count()).toBe(1)
  })
})

// === (2) Artist-Funnel: 1 Bewerbung pro Account (DB-unique) =================

describe('mission-funnel — Ein-Schuss-Bewerbung (DB-erzwungen)', () => {
  it('Doppel-Bewerbung desselben Users → P2002 am unique(userId), genau EIN Record', async () => {
    await prisma.artistApplication.create({
      data: { userId: 'u1', message: 'I make phonk, twenty chars plus.' },
    })

    let err: unknown = null
    try {
      await prisma.artistApplication.create({
        data: { userId: 'u1', message: 'Second shot must bounce off the unique.' },
      })
    } catch (e) {
      err = e
    }
    expect(isP2002(err)).toBe(true)
    expect(await prisma.artistApplication.count()).toBe(1)
    // Anderer User darf natuerlich (u2 unabhaengig von u1)
    await prisma.artistApplication.create({
      data: { userId: 'u2', message: 'Different account, different shot.' },
    })
    expect(await prisma.artistApplication.count()).toBe(2)
  })
})

// === (3) zod-Rejects (Write-Pfad-Validierung) ================================

describe('mission-funnel — zod-Schemas', () => {
  const validMission = {
    title: 'Recruit Wolves',
    type: 'RECRUITING',
    summary: 'Bring humans to the decks.',
    body: '## Do it',
  }

  it('Kontrolle: gueltige Payloads passieren', () => {
    expect(createMissionSchema.safeParse(validMission).success).toBe(true)
    expect(
      artistApplicationSchema.safeParse({
        message: 'I make phonk, twenty chars plus.',
        links: ['https://soundcloud.com/x'],
      }).success
    ).toBe(true)
  })

  it('Bewerbung: message < 20 Zeichen → reject', () => {
    const r = artistApplicationSchema.safeParse({ message: 'too short' })
    expect(r.success).toBe(false)
  })

  it('Bewerbung: mehr als 5 Links → reject', () => {
    const links = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`)
    const r = artistApplicationSchema.safeParse({
      message: 'I make phonk, twenty chars plus.',
      links,
    })
    expect(r.success).toBe(false)
  })

  it('Mission: javascript:-actionUrl → reject (nur http/https)', () => {
    const r = createMissionSchema.safeParse({
      ...validMission,
      actionUrl: 'javascript:alert(1)',
    })
    expect(r.success).toBe(false)
  })

  it('Bewerbung: javascript:-Link → reject (nur http/https)', () => {
    const r = artistApplicationSchema.safeParse({
      message: 'I make phonk, twenty chars plus.',
      links: ['javascript:alert(1)'],
    })
    expect(r.success).toBe(false)
  })
})

// === (4) Vanity-Schwelle ====================================================

describe('mission-funnel — showVanity(missionAcceptances)', () => {
  it('2 Annahmen → verborgen, 3 → sichtbar (Schwelle 3, kbk-mission-board)', () => {
    expect(showVanity(2, 'missionAcceptances')).toBe(false)
    expect(showVanity(3, 'missionAcceptances')).toBe(true)
  })
})

// === (5) Bewerbungs-Mail: Escaping + statischer Subject =====================

describe('mission-funnel — buildArtistApplicationEmail', () => {
  it('HTML in message wird escaped (kein rohes Markup im Mail-Body)', () => {
    const { html } = buildArtistApplicationEmail(
      'wolfie',
      '<script>alert("xss")</script><img src=x onerror=alert(1)>',
      []
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('username wird escaped, Links erscheinen escaped als Text', () => {
    const { html } = buildArtistApplicationEmail(
      '<b>evil</b>',
      'Twenty characters of honest message.',
      ['https://example.com/?a=1&b=2']
    )
    expect(html).not.toContain('<b>evil</b>')
    expect(html).toContain('&lt;b&gt;evil&lt;/b&gt;')
    expect(html).toContain('https://example.com/?a=1&amp;b=2')
  })

  it('Subject ist statisch — kein User-Input im Mail-Header (Injection-Schutz)', () => {
    const username = 'evil\r\nBcc: spam@example.com'
    const message = 'Header injection attempt via message, twenty chars.'
    const { subject } = buildArtistApplicationEmail(username, message, [])
    expect(subject).toBe('KaboomKartell — New artist application')
    expect(subject).not.toContain(username)
    expect(subject).not.toContain(message)
  })
})

// === (6) featured-Koerzierung (Fix Build-Skript + strikter Konsument) ========

describe('mission-funnel — featured-Frontmatter-Koerzierung', () => {
  const md = (fmLines: string) => `---\n${fmLines}\n---\nBody.\n`

  it('parseFrontmatter: Inline-Kommentar wird gestrippt, true wird boolean', () => {
    const { frontmatter } = parseFrontmatter(
      md('name: Test\nfeatured: true  # Featured-Mechanismus (ADR-039)')
    )
    expect(frontmatter.featured).toBe(true)
    expect(typeof frontmatter.featured).toBe('boolean')
  })

  it('parseFrontmatter: false wird boolean false', () => {
    const { frontmatter } = parseFrontmatter(md('featured: false'))
    expect(frontmatter.featured).toBe(false)
  })

  it('parseFrontmatter: schneidet NICHT in quoted Strings oder URL-Anker', () => {
    const { frontmatter } = parseFrontmatter(
      md('summary: "Schwelle 3 # keine Kommentar-Grenze"\nlink: https://example.com/#anchor')
    )
    expect(frontmatter.summary).toBe('Schwelle 3 # keine Kommentar-Grenze')
    expect(frontmatter.link).toBe('https://example.com/#anchor')
  })

  it('toProcessListItem: nur echtes boolean true zaehlt als featured', () => {
    const entry = (featured: unknown): ProcessEntry => ({
      id: 'kbk-artist-onboarding',
      idRaw: 'kbk-artist-onboarding',
      module: 'kbk',
      relPath: 'kbk-artist-onboarding.md',
      frontmatter: { name: 'Artist Onboarding', featured },
      bodyDe: 'Body',
      bodyEn: null,
    })
    expect(toProcessListItem(entry(true), 'en').featured).toBe(true)
    // Regression des urspruenglichen Bugs: der String "true" (kaputter Parser)
    // darf beim strikten Konsumenten NICHT als featured durchgehen.
    expect(toProcessListItem(entry('true'), 'en').featured).toBe(false)
    expect(toProcessListItem(entry(undefined), 'en').featured).toBe(false)
  })
})

// === (7) Mission-i18n: Resolver + Parser + Serializer + zod =================

describe('mission-funnel — resolveMissionText (Mission-i18n)', () => {
  const baseMission = {
    title: 'Recruit Wolves',
    summary: 'Bring humans to the decks.',
    body: '## Do it\n\nSpread the word.',
    actionLabel: 'Join now',
  }
  const deEntry = {
    title: 'Woelfe rekrutieren',
    summary: 'Bring Menschen an die Decks.',
    body: '## Mach es\n\nSag es weiter.',
    actionLabel: 'Jetzt mitmachen',
  }

  it('de vorhanden → deutsche Texte', () => {
    const mission = { ...baseMission, translations: JSON.stringify({ de: deEntry }) }
    expect(resolveMissionText(mission, 'de')).toEqual(deEntry)
  })

  it('de fehlt → EN-Basisfelder (Fallback)', () => {
    const mission = { ...baseMission, translations: JSON.stringify({ es: { title: 'Hola' } }) }
    expect(resolveMissionText(mission, 'de')).toEqual(baseMission)
  })

  it('Teil-Uebersetzung mischt feld-weise mit EN', () => {
    const mission = {
      ...baseMission,
      translations: JSON.stringify({ de: { title: 'Woelfe rekrutieren' } }),
    }
    const resolved = resolveMissionText(mission, 'de')
    expect(resolved.title).toBe('Woelfe rekrutieren')
    expect(resolved.summary).toBe(baseMission.summary)
    expect(resolved.body).toBe(baseMission.body)
    expect(resolved.actionLabel).toBe(baseMission.actionLabel)
  })

  it('kaputtes JSON → EN-Basisfelder, kein Crash', () => {
    const mission = { ...baseMission, translations: '{not json!!' }
    expect(resolveMissionText(mission, 'de')).toEqual(baseMission)
  })

  it('Nicht-String-Werte werden ignoriert (Typ-Guard vor dem Renderer)', () => {
    const mission = {
      ...baseMission,
      translations: JSON.stringify({
        de: { title: 42, summary: { evil: true }, body: ['nope'], actionLabel: null },
      }),
    }
    expect(resolveMissionText(mission, 'de')).toEqual(baseMission)
  })

  it('unbekanntes Locale (en/xx) → EN-Basisfelder', () => {
    const mission = { ...baseMission, translations: JSON.stringify({ de: deEntry }) }
    expect(resolveMissionText(mission, 'en')).toEqual(baseMission)
    expect(resolveMissionText(mission, 'xx')).toEqual(baseMission)
  })

  it('translations null/fehlend → EN-Basisfelder', () => {
    expect(resolveMissionText({ ...baseMission, translations: null }, 'de')).toEqual(baseMission)
    expect(resolveMissionText(baseMission, 'fr')).toEqual(baseMission)
  })

  it('parseMissionTranslations: unbekannte Locale-Keys + leere Strings fliegen raus', () => {
    const parsed = parseMissionTranslations(
      JSON.stringify({
        de: { title: 'Da', summary: '   ' },
        tlh: { title: 'Klingon bleibt draussen' },
        es: 'kein Objekt',
      })
    )
    expect(parsed).toEqual({ de: { title: 'Da' } })
  })

  it('serializeMissionTranslations: leer/null → null, gefuellt → JSON-String', () => {
    expect(serializeMissionTranslations(null)).toBeNull()
    expect(serializeMissionTranslations(undefined)).toBeNull()
    expect(serializeMissionTranslations({})).toBeNull()
    expect(serializeMissionTranslations({ de: {} })).toBeNull()
    const s = serializeMissionTranslations({ de: { title: 'Woelfe' } })
    expect(s).toBe(JSON.stringify({ de: { title: 'Woelfe' } }))
  })
})

describe('mission-funnel — zod missionTranslations (Laengen-Limits wie EN)', () => {
  const validMission = {
    title: 'Recruit Wolves',
    type: 'RECRUITING',
    summary: 'Bring humans to the decks.',
    body: '## Do it',
  }

  it('gueltige Teil-Uebersetzung passiert create + update', () => {
    const translations = { de: { title: 'Woelfe rekrutieren' }, fr: { summary: 'Court.' } }
    expect(createMissionSchema.safeParse({ ...validMission, translations }).success).toBe(true)
    expect(updateMissionSchema.safeParse({ translations }).success).toBe(true)
  })

  it('zu langer de-title (> 120) → reject', () => {
    const translations = { de: { title: 'x'.repeat(121) } }
    expect(createMissionSchema.safeParse({ ...validMission, translations }).success).toBe(false)
    expect(updateMissionSchema.safeParse({ translations }).success).toBe(false)
  })

  it('zu langes de-actionLabel (> 40) → reject; null raeumt (update)', () => {
    const translations = { de: { actionLabel: 'x'.repeat(41) } }
    expect(createMissionSchema.safeParse({ ...validMission, translations }).success).toBe(false)
    expect(updateMissionSchema.safeParse({ translations: null }).success).toBe(true)
  })
})

// === Bonus: Render-Guard (Fix K) — pure Helper-Funktion =====================

describe('mission-funnel — isSafeExternalUrl (Render-Guard)', () => {
  it('laesst nur http/https durch, blockt javascript:/data:/relativ/null', () => {
    expect(isSafeExternalUrl('https://ko-fi.com/kbk')).toBe(true)
    expect(isSafeExternalUrl('http://example.com')).toBe(true)
    expect(isSafeExternalUrl('HTTPS://EXAMPLE.COM')).toBe(true)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,<script>1</script>')).toBe(false)
    expect(isSafeExternalUrl('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeExternalUrl('//example.com')).toBe(false)
    expect(isSafeExternalUrl('/mission')).toBe(false)
    expect(isSafeExternalUrl(null)).toBe(false)
    expect(isSafeExternalUrl(undefined)).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
  })
})
