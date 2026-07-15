#!/usr/bin/env node
// merge-i18n-fragments.mjs — fuegt messages/_fragments/*.json in messages/{en,de,fr,es}.json ein.
//
// Jedes Fragment hat die Form:
//   { "en": {<teilbaum>}, "de": {<teilbaum>}, "es": {<teilbaum>}, "fr": {<teilbaum>} }
// wobei <teilbaum> der unter die jeweilige Locale-Wurzel zu mergende Namespace-Block ist.
// Deep-Merge pro Locale auf den bestehenden Katalog. Idempotent. Nur node:* (kein Package).
//
// Workflow: Subagenten schreiben pro Bereich ein Fragment, danach laeuft dieses Skript,
// danach scripts/validate-i18n.mjs (Paritaets-Gate). _fragments/ ist temporaer (gitignored).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MSG = join(ROOT, 'messages')
const FRAG = join(MSG, '_fragments')
const LOCALES = ['en', 'de', 'fr', 'es']

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepMerge(target, src, path = '') {
  for (const [k, v] of Object.entries(src)) {
    const p = path ? `${path}.${k}` : k
    if (isObj(v)) {
      if (target[k] !== undefined && !isObj(target[k])) throw new Error(`Konflikt (Typ) bei ${p}`)
      target[k] = target[k] ?? {}
      deepMerge(target[k], v, p)
    } else {
      if (isObj(target[k])) throw new Error(`Konflikt (Objekt ueberschrieben) bei ${p}`)
      target[k] = v
    }
  }
  return target
}

if (!existsSync(FRAG)) {
  console.log('Keine messages/_fragments/ — nichts zu mergen.')
  process.exit(0)
}
const frags = readdirSync(FRAG).filter((f) => f.endsWith('.json')).sort()
console.log(`Fragmente (${frags.length}): ${frags.join(', ') || '(keine)'}`)

for (const locale of LOCALES) {
  const catPath = join(MSG, `${locale}.json`)
  const cat = JSON.parse(readFileSync(catPath, 'utf8'))
  for (const f of frags) {
    const frag = JSON.parse(readFileSync(join(FRAG, f), 'utf8'))
    if (frag[locale]) deepMerge(cat, frag[locale], `${f}:${locale}`)
  }
  writeFileSync(catPath, JSON.stringify(cat, null, 2) + '\n', 'utf8')
  console.log(`✓ ${locale}.json gemerged`)
}
console.log('Fertig. Jetzt: node scripts/validate-i18n.mjs')
