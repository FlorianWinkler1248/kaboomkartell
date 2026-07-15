#!/usr/bin/env node
// validate-i18n.mjs — Katalog-Paritaets-Check fuer die next-intl-Sprach-Dateien.
//
// Prueft messages/{en,de,fr,es}.json gegen EN (Quellsprache/Referenz):
//   fehlt:  Key in EN vorhanden, in der Locale nicht  -> next-intl zeigt in Prod den Key-Pfad
//   extra:  Key in der Locale, in EN nicht            -> toter Key
//   typ:    Struktur-Mismatch (String vs. Objekt) am gleichen Pfad
//   leer:   Wert ist "" (leerer String)               -> typischer Copy-Paste-Stub
// Exit 1 bei jeglichem Drift, Exit 0 bei Paritaet. Keine externen Packages (nur node:*).
//
// Optional `--brand`: warnt (kein Fail) bei abweichender Schreibweise von Markenbegriffen,
// die laut ADR-031 in keiner Sprache uebersetzt werden duerfen.
//
// Doku: prozesse/kbk-i18n.md, ADR-031.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MESSAGES_DIR = join(ROOT, 'messages')
const REFERENCE = 'en'
const LOCALES = ['en', 'de', 'fr', 'es']
const BRAND_TERMS = ['KaboomKartell', 'Wolfpack', 'AURA+', 'Boomy', 'Phonk', 'Hardtek', 'Raggatek', 'Make Noise Together']

function load(locale) {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8'))
}

// Sammelt alle Leaf-Key-Pfade (Dot-Notation) -> Wert. Verschachtelte Objekte rekursiv.
function collect(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) collect(v, path, out)
    else out.set(path, v)
  }
  return out
}

const wantBrand = process.argv.includes('--brand')
const ref = collect(load(REFERENCE))
let errors = 0

for (const locale of LOCALES) {
  const map = collect(load(locale))
  const problems = []

  for (const [path, refVal] of ref) {
    if (!map.has(path)) { problems.push(`  fehlt:  ${path}`); continue }
    const val = map.get(path)
    if (typeof val !== typeof refVal) problems.push(`  typ:    ${path} (EN ${typeof refVal} / ${locale} ${typeof val})`)
    else if (typeof val === 'string' && val.trim() === '') problems.push(`  leer:   ${path}`)
  }
  for (const path of map.keys()) if (!ref.has(path)) problems.push(`  extra:  ${path}`)

  if (problems.length) {
    errors += problems.length
    console.error(`✗ ${locale}: ${problems.length} Problem(e)`)
    for (const p of problems) console.error(p)
  } else {
    console.log(`✓ ${locale}: ${map.size} Keys, Paritaet ok`)
  }
}

if (wantBrand) {
  for (const locale of LOCALES) {
    for (const [path, val] of collect(load(locale))) {
      if (typeof val !== 'string') continue
      for (const term of BRAND_TERMS) {
        const m = val.match(new RegExp(term.replace(/[+]/g, '\\+'), 'i'))
        if (m && m[0] !== term) console.warn(`⚠ ${locale}: Marken-Casing in ${path}: "${m[0]}" statt "${term}"`)
      }
    }
  }
}

if (errors) {
  console.error(`\n=== i18n-Check: ${errors} Problem(e) — FAIL ===`)
  process.exit(1)
}
console.log('\n=== i18n-Check: alle Kataloge in Paritaet — OK ===')
