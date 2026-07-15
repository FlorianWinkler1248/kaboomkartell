import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Unterstrich-Präfix = bewusst ungenutzt (Repo-Konvention, z.B. Callback-Hook-
      // Params wie WaveformRenderer.resize(_width,_height), die die Signatur halten).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],

      // === React-Compiler-Advisory-Ruleset (eslint-plugin-react-hooks v6, kam mit
      // Next 16 / React 19) — bewusst entschärft (CI-Gate-Rot seit 14.06.2026). ===
      // Das sind KEINE Laufzeit-Bugs, sondern Compiler-Optimierungs-Hinweise, die
      // bewährte, bewusste Patterns als Fehler markieren (z.B. das Latest-Ref-Pattern,
      // das ABSICHTLICH im Render schreibt, um Stale-Closures in setInterval-Callbacks
      // zu vermeiden — Refactor würde genau diese Fixes brechen). Die WICHTIGEN
      // klassischen Hook-Regeln (`rules-of-hooks`, `exhaustive-deps`) bleiben AKTIV.
      // Eine echte React-Compiler-Readiness-Runde (die 21 Stellen sauber aufarbeiten)
      // ist ein eigener Auftrag; bis dahin verhindern wir falsch-positives CI-Rot.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Test-Specs: vitest ist nicht installiert (laufen am Deploy via `pnpm dlx`);
    // sie tragen @ts-nocheck, damit tsc nicht über fehlende vitest-Typen stolpert.
    // Vom Lint-Gate ausgenommen — keine ausgelieferten Code-Dateien.
    "**/*.test.ts",
    "**/*.test.tsx",
  ]),
]);

export default eslintConfig;
