/**
 * Ref-Tracking — aggregierter, PII-freier Zähler (P0.8 / ADR-035).
 *
 * POST /api/metrics/ref  Body: { ref: "mcp" | "drop" | ... }
 *
 * Misst, wie viel Traffic über die `?ref=`-Deep-Links real auf der Seite landet
 * (v.a. `ref=mcp` aus den MCP-Antworten) — die Grundlage für die Phase-3-Entscheidung
 * ("nur wenn Phase 1/2 Traffic beweisen"). DSGVO-arm: KEINE IP, KEIN User, KEIN
 * Timestamp pro Hit — nur ein Tageszähler pro ref.
 *
 * Kein Schema-Change: der Zähler lebt in EINEM JSON-File unter dem persistenten
 * uploads-Storage (Symlink auf data/, überlebt Deploys — analog storage.ts).
 *
 * File-Format:  { "<ref>": { "<YYYY-MM-DD (UTC)>": <count> } }
 *   z.B.        { "mcp": { "2026-07-03": 42 }, "drop": { "2026-07-03": 3 } }
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const METRICS_FILE = path.join(process.cwd(), 'uploads', '_metrics', 'ref-counts.json')

// ref bewusst eng: kleine, bekannte Herkunfts-Tags (mcp, drop, …) — kein Freitext,
// damit das File nicht mit beliebigen Werten geflutet werden kann.
const bodySchema = z.object({
  ref: z.string().min(1).max(32).regex(/^[a-z0-9_-]+$/i),
})

// Eigener Bucket (IP-basiert, nur als Flut-Schutz — die IP wird NICHT gespeichert).
const metricsLimit = rateLimit({ interval: 60_000, maxKeys: 2000 })

function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!metricsLimit.check(`ref:${ip}`, 30).success) {
    return NextResponse.json({ success: false }, { status: 429 })
  }

  let ref: string
  try {
    ref = bodySchema.parse(await request.json()).ref.toLowerCase()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid ref' }, { status: 400 })
  }

  try {
    fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true })
    let data: Record<string, Record<string, number>> = {}
    if (fs.existsSync(METRICS_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'))
        if (parsed && typeof parsed === 'object') data = parsed
      } catch {
        data = {} // korruptes File → frisch beginnen (Zähler ist advisory)
      }
    }
    const day = todayUtc(new Date())
    data[ref] = data[ref] ?? {}
    data[ref][day] = (data[ref][day] ?? 0) + 1
    fs.writeFileSync(METRICS_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    // Metrics dürfen den Request-Flow NIE stören — auch bei Schreibfehler 204.
    console.error('[metrics/ref] write failed:', err)
  }

  return new NextResponse(null, { status: 204 })
}
