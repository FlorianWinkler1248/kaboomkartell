#!/usr/bin/env node
/**
 * Build-Time-Bundle aller Workflows aus ../../prozesse/ (Sp5-Top-Level).
 * Schreibt src/data/processes-bundle.json mit Frontmatter + Body in DE + (falls vorhanden) EN.
 *
 * Trigger: pnpm run build:processes (oder als prebuild-Hook).
 * Source-Pfad ueberschreibbar via env PROCESSES_SRC (Default: ../../prozesse).
 *
 * Format der Bundle-Datei:
 *   {
 *     "generatedAt": "2026-05-03T...",
 *     "sourcePath": "../../prozesse",
 *     "processes": [
 *       {
 *         "id": "kbk-track-upload",
 *         "module": "kbk",
 *         "frontmatter": { name, summary, audiences, ... title_en, summary_en, body_en_path },
 *         "bodyDe": "<markdown>",
 *         "bodyEn": "<markdown oder null>"
 *       }, ...
 *     ]
 *   }
 *
 * Frontmatter-Parser ist minimal (kein npm-yaml, ~40 LoC).
 * Path-Whitelist via Modul-Klassifikator (Substring-Match auf Datei-Name).
 */

const fs = require("node:fs");
const path = require("node:path");

const SOURCE = process.env.PROCESSES_SRC
  ? path.resolve(process.env.PROCESSES_SRC)
  : path.resolve(__dirname, "..", "..", "..", "prozesse");
const TARGET = path.resolve(__dirname, "..", "src", "data", "processes-bundle.json");

// Tool-Scope: KBK-Renderer zeigt NUR die KBK-Feature-Workflows.
// Brain-weite Pflicht-Workflows bleiben seit dem Public-Repo-Gang (12.06.2026)
// draussen — sie beschreiben interne Brain-/Server-Abläufe und gehören nicht
// in ein öffentliches Repo. Volltexte weiterhin im Brain (prozesse/pflicht/).
const MODULES_INCLUDE = new Set(["kbk"]);

// Modul-Klassifikator: Workflow-ID -> Modul-Sektion (fuer Sidebar-Gruppierung im Renderer).
// Substring-Match in Reihenfolge — first match wins.
const MODULE_RULES = [
  { match: /^kbk-/, module: "kbk" },
  { match: /^pflicht\//, module: "pflicht" },
  { match: /^master-hub\//, module: "master-hub" },
  { match: /^boomy\//, module: "boomy" },
];

function classifyModule(idWithDir) {
  for (const rule of MODULE_RULES) {
    if (rule.match.test(idWithDir)) return rule.module;
  }
  return "other";
}

/** Naiver YAML-Frontmatter-Parser fuer unsere Schema-Form. */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const fmRaw = match[1];
  const body = match[2];
  const fm = {};

  for (const line of fmRaw.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const colonAt = line.indexOf(":");
    if (colonAt === -1) continue;
    const key = line.slice(0, colonAt).trim();
    let value = line.slice(colonAt + 1).trim();

    // Inline-Kommentare strippen (`featured: true  # Erklaerung`) — aber NUR
    // bei unquoted Werten, sonst schneidet der Regex in String-Inhalte hinein.
    // `\s+#` verlangt Whitespace vor dem # → URLs mit #anchor bleiben intakt.
    if (!value.startsWith('"') && !value.startsWith("'")) {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    // Quoted strings
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value.startsWith("[") && value.endsWith("]")) {
      // Inline-Array
      value = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (value === "true") {
      // Boolean-Koerzierung — Konsumenten (toProcessListItem) machen strikte
      // ===-true-Checks; ein "true"-String wuerde featured stillschweigend verlieren.
      value = true;
    } else if (value === "false") {
      value = false;
    }
    fm[key] = value;
  }

  return { frontmatter: fm, body };
}

function walkMd(dir, base = "") {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_") || entry.name === "README.md" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...walkMd(full, rel));
    } else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.endsWith(".en.md")) {
      out.push({ full, rel });
    }
  }
  return out;
}

function loadEnSister(deFull, frontmatter) {
  let enPath = null;
  if (frontmatter.body_en_path) {
    const candidate = path.join(path.dirname(deFull), frontmatter.body_en_path);
    if (fs.existsSync(candidate)) enPath = candidate;
  }
  if (!enPath) {
    const conv = deFull.replace(/\.md$/, ".en.md");
    if (fs.existsSync(conv)) enPath = conv;
  }
  if (!enPath) return { body: null, frontmatter: {} };
  const enRaw = fs.readFileSync(enPath, "utf8");
  const parsed = parseFrontmatter(enRaw);
  return { body: parsed.body.trim(), frontmatter: parsed.frontmatter };
}

function build() {
  console.log(`[processes-bundle] Source: ${SOURCE}`);
  console.log(`[processes-bundle] Target: ${TARGET}`);

  if (!fs.existsSync(SOURCE)) {
    console.warn(
      `[processes-bundle] Source-Pfad nicht gefunden: ${SOURCE} — skip (committetes Bundle wird verwendet).`,
    );
    return;
  }

  const files = walkMd(SOURCE);
  console.log(`[processes-bundle] ${files.length} DE-Workflows gefunden`);

  const processes = [];
  let skipped = 0;
  for (const { full, rel } of files) {
    const raw = fs.readFileSync(full, "utf8");
    const { frontmatter, body } = parseFrontmatter(raw);

    const idRaw = rel.replace(/\.md$/, "");
    // Slash → Bindestrich fuer URL-sichere ID; Modul-Info bleibt erhalten via classifyModule
    const id = idRaw.replace(/\//g, "__");
    const module = classifyModule(idRaw);
    if (!MODULES_INCLUDE.has(module)) {
      skipped++;
      continue;
    }

    const enSister = loadEnSister(full, frontmatter);
    // EN-Frontmatter-Felder (title_en, summary_en, body_en_path) ins DE-Frontmatter mergen,
    // ohne DE-Werte zu überschreiben — Renderer erwartet alle EN-Pointer im selben Objekt.
    const mergedFrontmatter = { ...frontmatter };
    for (const key of ["title_en", "summary_en", "description_en"]) {
      if (enSister.frontmatter[key] && !mergedFrontmatter[key]) {
        mergedFrontmatter[key] = enSister.frontmatter[key];
      }
    }

    processes.push({
      id,
      idRaw,
      module,
      relPath: rel,
      frontmatter: mergedFrontmatter,
      bodyDe: body.trim(),
      bodyEn: enSister.body,
    });
  }

  processes.sort((a, b) => a.id.localeCompare(b.id));

  const bundle = {
    generatedAt: new Date().toISOString(),
    sourcePath: path.relative(path.resolve(__dirname, ".."), SOURCE),
    count: processes.length,
    countWithEn: processes.filter((p) => p.bodyEn).length,
    processes,
  };

  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.writeFileSync(TARGET, JSON.stringify(bundle, null, 2), "utf8");
  console.log(
    `[processes-bundle] OK: ${bundle.count} Workflows geschrieben (${bundle.countWithEn} mit EN-Volltext, ${skipped} ausserhalb Tool-Scope ${[...MODULES_INCLUDE].join("/")} skipped) → ${path.relative(process.cwd(), TARGET)}`,
  );
}

// Direktaufruf (`node scripts/build-processes-bundle.cjs` / prebuild) baut das
// Bundle; als Modul geladen exportiert die Datei nur den Parser (Unit-Tests).
if (require.main === module) {
  build();
}

module.exports = { parseFrontmatter };
